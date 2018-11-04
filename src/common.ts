import { TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';

export function convertInfo(
	info: TestSuiteInfo | TestInfo,
	convertPath: (path: string) => string
): TestSuiteInfo | TestInfo {

	let file = info.file;
	if (file) {
		file = convertPath(file);
	}

	if (info.type === 'suite') {
		let children = info.children.map(child => convertInfo(child, convertPath));
		return { ...info, file, children };
	} else {
		return { ...info, file };
	}
}
