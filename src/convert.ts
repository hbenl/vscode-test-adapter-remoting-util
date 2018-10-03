import { TestSuiteInfo, TestInfo, TestSuiteEvent, TestEvent } from 'vscode-test-adapter-api';

export function convertInfo(
	info: TestSuiteInfo | TestInfo,
	pathConverter: (path: string) => string
): void {

	if (info.file) {
		info.file = pathConverter(info.file);
	}

	if (info.type === 'suite') {
		for (const child of info.children) {
			convertInfo(child, pathConverter);
		}
	}
}

export function convertEvent(
	event: TestSuiteEvent | TestEvent,
	pathConverter: (path: string) => string
): void {

	if (event.type === 'suite') {

		if (typeof event.suite === 'object') {
			convertInfo(event.suite, pathConverter);
		}

	} else { // event.type === 'test'

		if (typeof event.test === 'object') {
			convertInfo(event.test, pathConverter);
		}
	}
}

export interface PathMapping {
	local: string,
	remote: string
}

export function localPathConverter(mappings: PathMapping[]): (path: string) => string {
	return (path: string) => {

		for (const mapping of mappings) {
			if (path.startsWith(mapping.local)) {
				return mapping.remote + path.substr(mapping.local.length);
			}
		}

		return path;
	}
}

export function remotePathConverter(mappings: PathMapping[]): (path: string) => string {
	return (path: string) => {

		for (const mapping of mappings) {
			if (path.startsWith(mapping.remote)) {
				return mapping.local + path.substr(mapping.remote.length);
			}
		}

		return path;
	}
}
