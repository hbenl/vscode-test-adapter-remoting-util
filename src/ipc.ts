import * as net from 'net';
import split from 'split';

export interface ILog {
	debug(msg: string): void;
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
}

export function createConnection(
	port: number,
	opts?: {
		host?: string,
		timeout?: number,
		retryInterval?: number,
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

export function receiveConnection(
	port: number,
	opts?: {
		host?: string,
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

export function writeMessage(socket: net.Socket, msg: any): void {
	socket.write(JSON.stringify(msg) + '\n');
}

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
