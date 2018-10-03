import { fork } from 'child_process';

export function runWorker(workerPath: string, workerArgs: any): Promise<void> {
	return new Promise<void>(resolve => {

		const childProc = fork(
			workerPath,
			[ JSON.stringify(workerArgs) ],
			{ execArgv: [] }
		);

		let finished = false;

		childProc.on('exit', () => {
			if (!finished) {
				resolve();
				finished = true;
			}
		});

		childProc.on('error', () => {
			if (!finished) {
				resolve();
				finished = true;
			}
		});
	});
}
