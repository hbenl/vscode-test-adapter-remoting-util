import * as net from 'net';
import { TestSuiteEvent, TestEvent, TestSuiteInfo } from 'vscode-test-adapter-api';
import { convertInfo } from './common';
import { readMessages } from './ipc';

export interface WorkerArgs {
	action: 'loadTests' | 'runTests';
	testFiles: string[];
	tests?: string[];
	mochaPath: string;
	mochaOpts: MochaOpts;
	monkeyPatch?: boolean;
	ipcPort?: number;
	ipcHost?: string;
	ipcRole?: 'client' | 'server';
	workerPath?: string;
	logEnabled: boolean;
}

export interface MochaOpts {
	ui: string,
	timeout: number,
	retries: number,
	requires: string[],
	exit: boolean
}

export interface ErrorInfo {
	type: 'error';
	errorMessage: string;
}

export function convertWorkerArgs(workerArgs: WorkerArgs, convertPath: (path: string) => string): WorkerArgs {
	return { ...workerArgs, testFiles: workerArgs.testFiles.map(convertPath) };
}

export function receiveTestLoadMessages(socket: net.Socket, handler: (msg: string | TestSuiteInfo | ErrorInfo | null) => void): void {
	readMessages(socket, handler);
}

export function receiveTestRunMessages(socket: net.Socket, handler: (msg: string | TestSuiteEvent | TestEvent) => void): void {
	readMessages(socket, handler);
}

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

export function convertTestRunMessage(
	msg: string | TestSuiteEvent | TestEvent,
	convertPath: (path: string) => string
): void {

	if (typeof msg === 'string') {
		return;
	}

	if (msg.type === 'suite') {

		if (typeof msg.suite === 'object') {
			convertInfo(msg.suite, convertPath);
		}

	} else if (msg.type === 'test') {

		if (typeof msg.test === 'object') {
			convertInfo(msg.test, convertPath);
		}
	}
}
