import * as net from 'net';
import split2 = require('split2');

export async function createWorkerProxy(
	localPort: number,
	remoteHost: string,
	remotePort: number,
	transform: (msg: any) => any
): Promise<{ dispose(): void }> {

	const remoteSocket = await createClientConnection(remoteHost, remotePort);

	let proxy: net.Server;
	try {

		proxy = await createServerAndListen(localPort);

	} catch(err) {
		remoteSocket.end();
		throw err;
	}

	let localSocket: net.Socket | undefined;
	proxy.on('connection', async socket => {
		localSocket = socket;

		// only one connection should be accepted, so we're closing the server now
		// (this won't close the connection that was just established)
		proxy.close();

		localSocket.pipe(split2()).on('data', (data: string) => {
			remoteSocket.write(JSON.stringify(transform(JSON.parse(data))));
		});

		localSocket.on('end', () => {
			remoteSocket.end();
		});
		remoteSocket.on('end', () => {
			localSocket!.end();
		});
	});

	return {
		dispose() {
			remoteSocket.end();
			if (localSocket) {
				localSocket.end();
			} else if (proxy.listening) {
				proxy.close();
			}
		}
	};
}

function createServerAndListen(port: number): Promise<net.Server> {
	return new Promise<net.Server>((resolve, reject) => {

		function onListening() {
			server.removeListener('error', onError);
			resolve(server);
		}

		function onError(err: Error) {
			server.removeListener('listening', onListening);
			reject(err);
		}

		const server = net.createServer();

		server.once('listening', onListening);
		server.once('error', onError);

		server.listen(port);
	});
}

function createClientConnection(host: string, port: number): Promise<net.Socket> {
	return new Promise<net.Socket>((resolve, reject) => {

		function onConnect() {
			socket.removeListener('error', onError);
			resolve(socket);
		}

		function onError(err: Error) {
			socket.removeListener('connect', onConnect);
			reject(err);
		}

		const socket = net.createConnection(port, host);

		socket.once('connect', onConnect);
		socket.once('error', onError);
	});
}
