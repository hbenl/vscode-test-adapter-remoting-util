import * as net from 'net';
import split from 'split';

/**
 * Loggers implementing this interface can be passed to `createConnection` and `receiveConnection`
 */
export interface ILog {
	debug(msg: string): void;
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
}

/**
 * Connect to the given port and return the socket if successful.
 * If the connection is rejected, this function will keep retrying every `retryInterval` milliseconds
 * until `timeout` milliseconds have passed, then it will reject the returned Promise.
 * If a connection is established, this function will wait for `rejectClosedSocket` milliseconds and
 * if the connection is closed during that time, it will retry connecting. This is sometimes necessary
 * if you connect through a TCP proxy (which is the case if you connect to exposed ports of a docker
 * container or through an ssh tunnel): the proxy may accept the connection and then immediately close
 * it again if it can't establish a connection to its target port.
 */
export function createConnection(

	/** the port to connect to */
	port: number,

	opts?: {

		/** the host to connect to, the default is localhost */
		host?: string,

		/** the amount of time (in milliseconds) to retry before giving up */
		timeout?: number,

		/** the amount of time (in milliseconds) to sleep before retrying */
		retryInterval?: number,

		/** the amount of time (in milliseconds) to wait after connecting to see if the
		 * connection is closed again. The default is 10, set this to 0 to disable
		 * this mechanism. */
		rejectClosedSocket?: number,

		log?: ILog
	}
): Promise<net.Socket> {

	const options = opts || {};
	const host = options.host;
	const timeout = (options.timeout !== undefined) ? options.timeout : 5000;
	const retryInterval = options.retryInterval || 200;
	const rejectClosedSocket = (options.rejectClosedSocket !== undefined) ? options.rejectClosedSocket : 10;
	const log = options.log;

	if (timeout > 0) {

		return retry(
			() => createConnection(port, { ...opts, timeout: 0 }),
			timeout,
			retryInterval
		);

	} else {

		return new Promise<net.Socket>((resolve, reject) => {

			async function onConnect() {

				if (log) log.info('IPC client connected to server');

				socket.removeListener('error', onError);

				if (rejectClosedSocket > 0) {

					await delay(rejectClosedSocket);

					if (socket.destroyed) {
						if (log) log.info('IPC client socket was closed immediately');
						reject(new Error('IPC client socket was closed immediately'));
						return;
					}
				}

				resolve(socket);
			}

			function onError(err: Error) {

				if (log) log.info(`IPC client failed to connect to server: ${err}`);

				socket.removeListener('connect', onConnect);

				reject(err);
			}

			const socket = net.createConnection(port, host);

			socket.once('connect', onConnect);
			socket.once('error', onError);
		});
	}
}

/**
 * Wait for a connection on the given port and return the socket if successful.
 * This function will wait for a connection for `timeout` milliseconds and reject the returned
 * Promise if no connection is received within that time. If a connection is received, this
 * function will close the TCP server, i.e. it will not accept more than one connection.
 */
export function receiveConnection(

	/** the port to listen on */
	port: number,

	opts?: {

		/** the address to listen on (this is the second argument to [`server.listen()`]() */
		host?: string,

		/** the amount of time (in milliseconds) to wait for a connection before giving up */
		timeout?: number,

		log?: ILog
	}
): Promise<net.Socket> {

	const options = opts || {};
	const host = options.host;
	const timeout = (options.timeout !== undefined) ? options.timeout : 5000;
	const log = options.log;

	return new Promise<net.Socket>(async (resolve, reject) => {

		function onConnection(socket: net.Socket) {

			if (log) {

				log.info('IPC server received client connection');

				socket.once('end', () => {
					log.info('IPC server received disconnect from client');
				});
			}

			// only one connection should be accepted, so we're closing the server now
			// (this won't close the connection that was just established)
			server.close();

			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}

			resolve(socket);
		}

		function onTimeout() {

			if (log) log.error('IPC server timed out before receiving a client connection');

			server.removeListener('connection', onConnection);
			server.close();

			reject(new Error('IPC server timed out before receiving a client connection'));
		}

		let timeoutHandle: NodeJS.Timer | undefined;
		if (timeout > 0) {
			timeoutHandle = setTimeout(onTimeout, timeout);
		}

		const server = await createServerAndListen(port, host, log);

		server.on('connection', onConnection);
	});
}

/**
 * Send a message via the given `socket`. The given message is JSON-encoded and a newline character appended
 */
export function writeMessage(socket: net.Socket, msg: any): Promise<void> {
	return new Promise<void>(resolve => socket.write(JSON.stringify(msg) + '\n', resolve));
}

/**
 * Receive messages on the given socket. The data from the socket is split into lines and each line
 * is parsed using `JSON.parse()`
 */
export function readMessages<T>(socket: net.Socket, handler: (msg: T) => void): void {
	socket.pipe(split()).on('data', (data: string) => {
		if (data) {
			handler(JSON.parse(data));
		}
	});
}

function createServerAndListen(port: number, host: string | undefined, log?: ILog): Promise<net.Server> {
	return new Promise<net.Server>((resolve, reject) => {

		function onListening() {

			if (log) log.info(`IPC server is listening on port ${port}`);

			server.removeListener('error', onError);

			resolve(server);
		}

		function onError(err: Error) {

			if (log) log.error(`IPC server failed listening: ${err}`);

			server.removeListener('listening', onListening);

			reject(err);
		}

		const server = net.createServer();

		if (log) log.info('IPC server created');

		server.once('listening', onListening);
		server.once('error', onError);

		server.listen(port, host);
	});
}

async function retry<T>(fn: () => Promise<T>, timeout: number, retryInterval: number, log?: ILog): Promise<T> {

	const endTime = Date.now() + timeout;

	while (true) {
		try {

			return await fn();

		} catch (err) {

			if (Date.now() >= endTime) {

				if (log) log.warn('Giving up.');
				throw err;

			} else {

				await delay(retryInterval);
				if (log) log.info('Retrying...');

			}
		}
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}
