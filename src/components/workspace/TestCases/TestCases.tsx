/* eslint-disable no-useless-escape */
import { useFile } from '@/hooks';
import { useLogActivity } from '@/hooks/logActivity.hooks';
import { useProjectActions } from '@/hooks/project.hooks';
import { useWorkspaceActions } from '@/hooks/workspace.hooks';
import { Analytics } from '@/utility/analytics';
import EventEmitter from '@/utility/eventEmitter';
import Path from '@isomorphic-git/lightning-fs/src/path';
import { FC } from 'react';
import ExecuteFile from '../ExecuteFile';
import s from './TestCases.module.scss';

interface Props {
  projectId: string;
}

const TestCases: FC<Props> = ({ projectId }) => {
  const { createLog } = useLogActivity();

  const { compileTsFile } = useWorkspaceActions();
  const { getFile } = useFile();
  const { compileFuncProgram } = useProjectActions();

  const executeTestCases = async (filePath: string) => {
    let testCaseCode = '';

    try {
      testCaseCode = (await compileTsFile(filePath, projectId))[0].code;
    } catch (error) {
      if ((error as Error).message) {
        createLog((error as Error).message, 'error');
        return;
      }
      console.log(error);
      return;
    }

    // if (!cellBuilderRef.current?.contentWindow) return;

    const linesToRemove = [
      /import\s+['"]@ton-community\/test-utils['"];/g,
      /import\s+\{[^}]+\}\s+from\s+['"]@ton-community\/blueprint['"];/g,
    ];

    linesToRemove.forEach((pattern) => {
      testCaseCode = testCaseCode.replace(pattern, '');
    });

    // const compileBlockExp = /compile[^(]*\(([^)]*)\)/;
    const compileBlockExp = /compile\(['"]([^'"]+)['"]\)/g;

    const contractCompileBlock = compileBlockExp.exec(testCaseCode);
    const contractPath = contractCompileBlock?.[1].replace(/['"]/g, '');

    const contractAbsolutePath = Path.normalize(`${projectId}/${contractPath}`);
    // if (!contractPath) {
    //   createLog('Please specify contract path', 'error');
    //   return;
    // }
    let contractFile = undefined;
    try {
      contractFile = await getFile(contractAbsolutePath);
    } catch (error) {
      /* empty */
    }
    if (contractPath && !contractFile) {
      createLog(
        `Contract file not found - ${contractPath}. Define correct absolute path. Ex. contracts/main.fc or /contracts/main.fc`,
        'error',
      );
      return;
    }

    let contractBOC = undefined;

    if (contractPath && contractCompileBlock && contractPath.includes('.fc')) {
      try {
        const contract = await compileFuncProgram(
          { path: contractAbsolutePath },
          projectId,
        );
        contractBOC = contract.contractBOC;
        testCaseCode = testCaseCode.replace(
          contractCompileBlock[0],
          `bocToCell("${contractBOC}")`,
        );
        testCaseCode = `
        const {
        Cell,
      } = require("@ton/core");
        ${testCaseCode}
        `;
      } catch (error) {
        let _error = '';
        if (typeof error === 'string') {
          _error = error;
        } else if ((error as Error).message) {
          _error = (error as Error).message;
        }
        if (_error) {
          createLog(_error, 'error');
        }
      }
    }

    testCaseCode = testCaseCode
      .replace(/import\s*\'@ton-community\/test-utils\';+$/, '')
      .replace(/import\s*'@ton\/test-utils';\s*\n?/, '')
      .replace(/import\s*{/g, 'const {')
      .replace(
        /}\s*from\s*'@ton-community\/sandbox';/,
        '} = require("@ton/sandbox");',
      )
      .replace(/}\s*from\s*'@ton\/sandbox';/, '} = require("@ton/sandbox");')
      .replace(/}\s*from\s*'@ton\/core';/, '} = require("@ton/core");')
      .replace(/}\s*from\s*'ton-core';/, '} = require("@ton/core");');

    // eslint-disable-next-line no-useless-escape
    testCaseCode = `
    require("@ton\/test-utils");
    function bocToCell(codeBoc) {
      return Cell.fromBoc(Buffer.from(codeBoc, "base64"))[0];
    }
    
    ${testCaseCode}
    `;

    await runIt(filePath, testCaseCode);
  };

  const runIt = async (filePath: string, codeBase: string) => {
    const _webcontainerInstance = window.webcontainerInstance;
    filePath = filePath.replace('.spec.ts', '.spec.js');

    if (!_webcontainerInstance?.path) {
      return;
    }
    createLog('Running test cases...', 'info', true);
    const fileName = filePath.split('/').pop();
    await _webcontainerInstance.fs.writeFile(fileName!, codeBase);

    const response = await _webcontainerInstance.spawn('npx', [
      'jest',
      fileName!,
    ]);

    await response.output.pipeTo(
      new WritableStream({
        write(data) {
          EventEmitter.emit('TEST_CASE_LOG', data);
        },
      }),
    );
    Analytics.track('Execute Test Case', {
      platform: 'IDE',
      type: `TEST_CASE`,
    });
  };

  return (
    <div className={s.root}>
      <ExecuteFile
        projectId={projectId}
        allowedFile={['spec.ts']}
        label={`Run`}
        description="Select .spec.ts file to run test cases"
        onClick={(e, data) => {
          executeTestCases(data).catch(() => {});
          EventEmitter.emit('SET_SIDEBAR_VISIBILITY', false);
        }}
      />
    </div>
  );
};

export default TestCases;
