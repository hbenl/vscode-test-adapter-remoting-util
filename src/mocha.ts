import * as net from 'net';
import { TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { convertInfo } from './common';
import { readMessages } from './ipc';

export type EnvVars = { [envVar: string]: string | null };

/**
 * This object contains all arguments to the worker script except for the `NetworkOptions`
 */
export interface WorkerArgs {

	/** what the worker should do */
	action: 'loadTests' | 'runTests';

	/** the working directory */
	cwd: string;

	/** the absolute paths of all files containing tests */
	testFiles: string[];

	/** if `action` is `'runTests'`, this contains the IDs of all tests that should be run */
	tests?: string[];

	/** environment variables to be set in the worker process */
	env: EnvVars;

	/** the absolute path to the mocha _package_ */
	mochaPath?: string;

	/** options to be passed to mocha */
	mochaOpts: MochaOpts;

	/** if `action` is `'loadTests'`, this flag determines if the worker should apply a monkey patch
	 * to mocha that is necessary to detect the source locations of dynamically generated tests. */
	monkeyPatch?: boolean;

	/** this flag tells the worker if the diagnostic log is enabled */
	logEnabled: boolean;

	/** the absolute path to the worker script */
	workerScript?: string;

	/** if the tests should be run in the debugger, this contains the port that the debugger should
	 * use. Otherwise it is undefined. */
	debuggerPort?: number;
}

/**
 * The mocha options supported by the worker script
 */
export interface MochaOpts {
	ui: string,
	timeout: number,
	retries: number,
	requires: string[],
	exit: boolean
}

/**
 * This object is sent by the worker script if loading the tests failed,
 * the `errorMessage` will be displayed in the Test Explorer UI
 */
export interface ErrorInfo {
	type: 'error';
	errorMessage: string;
}

/**
 * This object can be passed (JSON-encoded) as the first command-line argument to the worker process
 * to make it communicate via TCP/IP instead of node's IPC channel.
 */
export interface NetworkOptions {

	/** whether the worker should act as a TCP client or server */
	role: 'client' | 'server';

	/** the TCP port that the worker should use */
	port: number;

	/**
	 * If `role` is `'client'`, this specifies the host that the worker should connect to,
	 * the default is `localhost`.
	 * If `role` is `'server'`, this specifies the address on which the worker will listen.
	 */
	host?: string;
}

/**
 * Convert all paths in a `WorkerArgs` object using the given `convertPath` function
 */
export function convertWorkerArgs(workerArgs: WorkerArgs, convertPath: (path: string) => string): WorkerArgs {
	return { 
		...workerArgs,
		cwd: convertPath(workerArgs.cwd),
		testFiles: workerArgs.testFiles.map(convertPath),
		mochaPath: workerArgs.mochaPath ? convertPath(workerArgs.mochaPath) : undefined
	};
}

/**
 * This is a typed version of `readMessages` for receiving the worker protocol messages when loading the tests
 */
export function receiveTestLoadMessages(socket: net.Socket, handler: (msg: string | TestSuiteInfo | ErrorInfo | null) => void): void {
	readMessages(socket, handler);
}

/**
 * This is a typed version of `readMessages` for receiving the worker protocol messages when running the tests
 */
export function receiveTestRunMessages(socket: net.Socket, handler: (msg: string | TestSuiteEvent | TestEvent) => void): void {
	readMessages(socket, handler);
}

/**
 * Convert all paths in worker protocol messages when loading the tests using the given `convertPath` function
 */
export function convertTestLoadMessage(
	msg: string | TestSuiteInfo | ErrorInfo | null,
	convertPath: (path: string) => string
): string | TestSuiteInfo | ErrorInfo | null {

	if ((typeof msg === 'object') && msg && (msg.type === 'suite')) {
		return <TestSuiteInfo>convertInfo(msg, convertPath);
	} else {
		return msg;
	}
}

/**
 * Convert all paths in worker protocol messages when running the tests using the given `convertPath` function
 */
export function convertTestRunMessage(
	msg: string | TestSuiteEvent | TestEvent,
	convertPath: (path: string) => string
): string | TestSuiteEvent | TestEvent {

	if (typeof msg === 'string') {
		return msg;
	}

	if (msg.type === 'suite') {

		if (typeof msg.suite === 'object') {
			return { ...msg, suite: <TestSuiteInfo>convertInfo(msg.suite, convertPath) };
		}

	} else if (msg.type === 'test') {

		if (typeof msg.test === 'object') {
			return { ...msg, test: <TestInfo>convertInfo(msg.test, convertPath) };
		}
	}

	return msg;
}
