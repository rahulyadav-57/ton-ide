import TonAuth from '@/components/auth/TonAuth/TonAuth';
import { UserContract, useContractAction } from '@/hooks/contract.hooks';
import { useLogActivity } from '@/hooks/logActivity.hooks';
import {
  ABIField,
  CellABI,
  NetworkEnvironment,
  Project,
  ProjectSetting,
  TactABIField,
  TactInputFields,
} from '@/interfaces/workspace.interface';
import { Analytics } from '@/utility/analytics';
import { buildTs } from '@/utility/typescriptHelper';
import {
  delay,
  getFileExtension,
  htmlToAnsi,
  isIncludesTypeCellOrSlice,
  tonHttpEndpoint,
} from '@/utility/utils';
import { Network } from '@orbs-network/ton-access';
import { ABIArgument, Cell } from '@ton/core';
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { CHAIN, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Button, Form, Select } from 'antd';
import Link from 'next/link';
import { FC, Fragment, useEffect, useRef, useState } from 'react';
import ContractInteraction from '../ContractInteraction';
import ExecuteFile from '../ExecuteFile/ExecuteFile';
import s from './BuildProject.module.scss';

import AppIcon from '@/components/ui/icon';
import { useFile } from '@/hooks';
import { useProject } from '@/hooks/projectV2.hooks';
import { useSettingAction } from '@/hooks/setting.hooks';
import { ABIParser, parseInputs } from '@/utility/abi';
import EventEmitter from '@/utility/eventEmitter';
import { Maybe } from '@ton/core/dist/utils/maybe';
import { TonClient } from '@ton/ton';
import { useForm } from 'antd/lib/form/Form';
import packageJson from 'package.json';
import { OutputChunk } from 'rollup';
import { renderField } from '../ABIUi/TactABIUi';
import { globalWorkspace } from '../globalWorkspace';
import CellBuilder, { CellValues, generateCellCode } from './CellBuilder';

const blankABI = {
  getters: [],
  setters: [],
  initParams: [],
};

interface Props {
  projectId: string;
  onCodeCompile: (codeBOC: string) => void;
  contract: unknown;
  updateContract: (contractInstance: unknown) => void;
}
const BuildProject: FC<Props> = ({ projectId, contract, updateContract }) => {
  const [isLoading, setIsLoading] = useState('');
  const [buildCount, setBuildCount] = useState(0);
  const { createLog } = useLogActivity();
  const [environment, setEnvironment] = useState<NetworkEnvironment>('SANDBOX');
  const [buildOutput, setBuildoutput] = useState<{
    contractBOC: string | null;
    dataCell: Cell | null;
  } | null>(null);
  const cellBuilderRef = useRef<HTMLIFrameElement>(null);
  const [contractABI, setContractABI] = useState<{
    getters: ABIField[];
    setters: ABIField[];
    initParams: Maybe<ABIArgument[]>;
  }>(blankABI);
  const [selectedContract, setSelectedContract] = useState<string | undefined>(
    undefined,
  );

  const { isAutoBuildAndDeployEnabled } = useSettingAction();
  const {
    projectFiles,
    readdirTree,
    activeProject,
    updateProjectSetting,
    updateABIInputValues,
    getABIInputValues,
  } = useProject();
  const { getFile } = useFile();

  const [tonConnector] = useTonConnectUI();
  const chain = tonConnector.wallet?.account.chain;
  const connectedWalletAddress = useTonAddress();

  const { sandboxBlockchain } = globalWorkspace;
  const tactVersion = packageJson.dependencies['@tact-lang/compiler'].replace(
    '^',
    '',
  );

  const [deployForm] = useForm();

  const { deployContract } = useContractAction();

  const contractsToDeploy = () => {
    return projectFiles
      .filter((f) => {
        const _fileExtension = getFileExtension(f.name || '');
        return (
          f.path.startsWith(`${activeProject?.path}/dist`) &&
          ['abi'].includes(_fileExtension as string)
        );
      })
      .map((f) => {
        return {
          id: f.id,
          name: f.name
            .replace('.abi', '')
            .replace('tact_', '')
            .replace('func_', ''),
          path: f.path,
        };
      });
  };

  const cellBuilder = (info: string) => {
    if (!activeProject?.language || activeProject.language !== 'func')
      return <></>;
    return <CellBuilder form={deployForm} info={info} type="deploy" />;
  };

  const deployView = () => {
    const _contractsToDeploy = contractsToDeploy();

    if (_contractsToDeploy.length === 0) {
      return;
    }

    return (
      <>
        <hr />
        <Form
          className={`${s.form} app-form`}
          form={deployForm}
          layout="vertical"
          onFinish={(values) => {
            initDeploy(values as FormValues).catch(() => {});
          }}
          onValuesChange={(changedValues) => {
            if (Object.hasOwn(changedValues, 'contract')) {
              updateSelectedContract(changedValues.contract);
            }
          }}
        >
          <Form.Item
            name="contract"
            className={s.formItem}
            rules={[{ required: true, message: 'Please select contract' }]}
          >
            <Select
              placeholder="Select a contract"
              className="w-100"
              allowClear
            >
              {_contractsToDeploy.map((f) => (
                <Select.Option key={f.path} value={f.path} title={f.path}>
                  {f.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {cellBuilder('Update initial contract state in ')}
          {selectedContract &&
            contractABI.initParams &&
            contractABI.initParams.length > 0 && (
              <div className={s.nestedForm}>
                {contractABI.initParams.map((item) => {
                  return (
                    <Fragment key={item.name}>
                      {renderField(
                        item as unknown as TactABIField,
                        projectFiles,
                      )}
                    </Fragment>
                  );
                })}
              </div>
            )}

          <Button
            type="primary"
            htmlType="submit"
            // loading={isLoading == 'deploy'}
            disabled={selectedContract === undefined}
            className="w-100 item-center-align ant-btn-primary-gradient"
          >
            <AppIcon name="Rocket" />
            {activeProject?.contractAddress ? 'Redeploy' : 'Deploy'}
          </Button>
        </Form>
      </>
    );
  };

  interface FormValues {
    [key: string]: string | number | boolean | bigint | undefined;
    queryId?: string;
    cell?: string;
    contract?: string;
  }

  const initDeploy = async (formValues: FormValues) => {
    EventEmitter.emit('SET_SIDEBAR_VISIBILITY', false);
    const tempFormValues = { ...formValues };

    let initParams = '';
    if (tempFormValues.queryId) {
      delete tempFormValues.queryId;
    }
    if (tempFormValues.cell) {
      delete tempFormValues.cell;
    }

    try {
      if (activeProject?.language === 'tact') {
        delete tempFormValues.contract;

        updateABIInputValues({
          key: 'init',
          value: tempFormValues as TactInputFields,
          type: 'Init',
        });

        const tsProjectFiles: Record<string, string> = {};
        if (isIncludesTypeCellOrSlice(tempFormValues)) {
          const fileCollection = await readdirTree(
            `${activeProject.path}`,
            {
              basePath: null,
              content: true,
            },
            (file: { path: string; name: string }) =>
              !file.path.startsWith('dist') &&
              file.name.endsWith('.ts') &&
              !file.name.endsWith('.spec.ts'),
          );
          fileCollection.forEach((file) => {
            tsProjectFiles[file.path!] = file.content ?? '';
          });
        }

        initParams = await parseInputs(
          JSON.parse(JSON.stringify(tempFormValues)),
          tsProjectFiles,
        );
      } else if (formValues.cell) {
        initParams = formValues.cell;
      }
      if (!tonConnector.connected && environment !== 'SANDBOX') {
        throw new Error('Please connect wallet');
      }
      if (chain && environment !== 'SANDBOX' && CHAIN[environment] !== chain) {
        throw new Error(`Please connect wallet to ${environment}`);
      }
      setIsLoading('deploy');
      await createStateInitCell(initParams);
    } catch (error) {
      setIsLoading('');
      if (typeof error === 'string') {
        createLog(error, 'error');
        return;
      }
      if (error instanceof Error) {
        createLog(error.message, 'error');
        return;
      }
    }
  };

  const deploy = async () => {
    createLog(`Deploying contract ...`, 'info');
    const contractBOCPath = selectedContract?.replace('.abi', '.code.boc');
    const contractBOC = (await getFile(contractBOCPath!)) as string;
    if (!contractBOC) {
      throw new Error('Contract BOC is missing. Rebuild the contract.');
    }
    try {
      if (sandboxBlockchain && environment === 'SANDBOX') {
        const blockchain = await Blockchain.create();
        globalWorkspace.sandboxBlockchain = blockchain;

        const wallet = await blockchain.treasury('user');
        globalWorkspace.sandboxWallet = wallet;
        createLog(
          htmlToAnsi(
            `Sandbox account created. Address: <i>${wallet.address.toString()}</i>`,
          ),
          'info',
          false,
        );
      }
      const {
        address: _contractAddress,
        contract,
        logs,
      } = await deployContract(
        contractBOC,
        buildOutput?.dataCell as unknown as string,
        environment.toLowerCase() as Network,
        activeProject as Project,
      );

      Analytics.track('Deploy project', {
        platform: 'IDE',
        type: `TON-${activeProject?.language}`,
        environment: environment.toLowerCase(),
      });
      createLog(
        htmlToAnsi(
          `Contract deployed on <b><i>${environment}</i></b> <br /> Contract address: ${_contractAddress}`,
        ),
        'success',
      );

      for (let i = 0; i < (logs ?? []).length; i++) {
        if (!logs?.[i]) continue;
        createLog(logs[i], 'info', false);
      }

      if (!_contractAddress) {
        return;
      }
      if (contract) {
        updateContract(contract);
      }

      updateProjectSetting({
        contractAddress: _contractAddress,
      } as ProjectSetting);
    } catch (error) {
      console.log(error, 'error');
      const errorMessage = (error as Error).message.split('\n');
      for (const message of errorMessage) {
        createLog(message, 'error', true, true);
      }
    } finally {
      setIsLoading('');
    }
  };

  const createStateInitCell = async (initParams = '') => {
    if (!selectedContract) {
      throw new Error('Please select contract');
    }
    const contractScriptPath = selectedContract.replace('.abi', '.ts');
    if (!cellBuilderRef.current?.contentWindow) return;
    let contractScript = '';
    try {
      contractScript = (await getFile(contractScriptPath)) as string;
    } catch (error) {
      /* empty */
    }
    if (activeProject?.language === 'tact' && !contractScript) {
      throw new Error('Contract script is missing. Rebuild the contract.');
    }

    try {
      let jsOutout = [];

      if (activeProject?.language == 'tact') {
        jsOutout = await buildTs(
          {
            'tact.ts': contractScript,
          },
          'tact.ts',
        );
      } else {
        let stateInitContent = '';
        let cellCode = '';
        try {
          stateInitContent = (await getFile(
            `${activeProject?.path}/stateInit.cell.ts`,
          )) as string;
        } catch (error) {
          console.log('stateInit.cell.ts is missing');
        }
        if (!stateInitContent && !initParams) {
          throw new Error(
            'State init data is missing in file stateInit.cell.ts',
          );
        }
        if (initParams) {
          cellCode = generateCellCode(initParams as unknown as CellValues[]);
          updateProjectSetting({
            cellABI: { deploy: initParams as CellABI },
          } as ProjectSetting);
        } else {
          cellCode = stateInitContent;
        }

        jsOutout = await buildTs(
          {
            'stateInit.cell.ts': cellCode,
            'cell.ts': 'import cell from "./stateInit.cell.ts"; cell;',
          },
          'cell.ts',
        );
      }

      const finalJsoutput = fromJSModule((jsOutout as OutputChunk[])[0].code);

      const contractName = extractContractName(selectedContract);

      if (activeProject?.language == 'tact') {
        const _code = `async function main(initParams) {
          ${finalJsoutput}
          const contractInit = await ${contractName}.fromInit(...Object.values(initParams));
          return contractInit;
        } return main(initParams)`;
        //  TODO: Find a better solution may be worker or js sandbox
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const contractInit = await new Function('initParams', _code)({
          ...(initParams as unknown as object),
        });
        window.contractInit = contractInit;
        deploy().catch(() => {});
        return;
      }

      cellBuilderRef.current.contentWindow.postMessage(
        {
          name: 'ton-web-ide',
          type: 'state-init-data',
          code: finalJsoutput,
          language: activeProject?.language,
          contractName: activeProject?.contractName,
          initParams,
        },
        '*',
      );
    } catch (error) {
      setIsLoading('');
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('object is not defined')) {
        throw new Error('Rebuild contract first');
      }
      if (errorMessage.includes("'default' is not exported by ")) {
        throw new Error("'default' is not exported by stateInit.cell.ts");
      }
      if (errorMessage) {
        createLog(errorMessage, 'error');
        return;
      }
      throw error;
    }
  };

  const isContractInteraction = () => {
    let isValid =
      activeProject?.path && selectedContract && activeProject.contractAddress
        ? true
        : false;
    if (environment === 'SANDBOX') {
      isValid = isValid && globalWorkspace.sandboxBlockchain ? true : false;
    }
    return isValid;
  };

  const updateABI = async () => {
    if (!selectedContract) {
      setContractABI(blankABI);
      return;
    }
    const contractABIFile = (await getFile(selectedContract)) as string;

    if (selectedContract && !contractABIFile) {
      updateSelectedContract('');
      return;
    }
    if (!contractABIFile) {
      createLog('Contract ABI is missing. Rebuild the contract.', 'error');
      return;
    }
    const contractABI = JSON.parse(contractABIFile || '{}');
    if (activeProject?.language === 'tact') {
      const abi = new ABIParser(JSON.parse(JSON.stringify(contractABI)));
      contractABI.getters = abi.getters;
      contractABI.setters = abi.receivers;
      contractABI.initParams = abi.init;
    }

    setContractABI({
      getters: contractABI.getters || [],
      setters: contractABI.setters || [],
      initParams: contractABI.initParams || [],
    });
  };

  const getConnectedWallet = () => {
    let _connectedWalletAddress =
      environment === 'SANDBOX' &&
      globalWorkspace.sandboxWallet?.address.toString();

    if (environment !== 'SANDBOX' && connectedWalletAddress) {
      _connectedWalletAddress = connectedWalletAddress;
    }
    if (!_connectedWalletAddress) {
      return <></>;
    }

    return (
      <div className={`${s.connectedWallet} wrap-text`}>
        Connected Wallet: <span>{_connectedWalletAddress}</span>
      </div>
    );
  };

  const updatNetworkEnvironment = (network: NetworkEnvironment) => {
    updateProjectSetting({
      network,
    } as ProjectSetting);
    setEnvironment(network);
  };

  const updateSelectedContract = (contract: string) => {
    setSelectedContract(contract);
    updateProjectSetting({
      selectedContract: contract,
    } as ProjectSetting);
  };

  const extractContractName = (currentContractName: string) => {
    return currentContractName
      .replace(activeProject?.path + '/', '')
      .replace('dist/', '')
      .replace('.abi', '')
      .replace('tact_', '')
      .replace('func_', '');
  };

  const fromJSModule = (jsModuleCode: string) => {
    return jsModuleCode
      .replace(/^import\s+{/, 'const {')
      .replace(/}\s+from\s.+/, '} = window.TonCore;')
      .replace(/^\s*export\s+\{[^}]*\};\s*/m, '');
  };

  const getSelectedContractJsBuild = async (
    currentContractName: string,
    language: 'tact' | 'func',
    supressErrors = false,
  ) => {
    const contractScriptPath = currentContractName.replace('.abi', '.ts');
    const contractScript = (await getFile(contractScriptPath)) as string;
    if (language === 'tact' && !contractScript) {
      if (supressErrors) {
        return;
      }
      throw new Error('Contract script is missing. Rebuild the contract.');
    }

    const jsOutout = await buildTs(
      {
        'tact.ts': contractScript,
      },
      'tact.ts',
    );

    const finalJSoutput = fromJSModule((jsOutout as OutputChunk[])[0].code);

    return { finalJSoutput };
  };

  const updateContractInstance = async () => {
    if (
      !selectedContract ||
      !activeProject?.contractAddress ||
      activeProject.language !== 'tact' ||
      window.contractInit
    ) {
      return;
    }

    if (activeProject.contractAddress && environment == 'SANDBOX') {
      return;
    }

    const output = await getSelectedContractJsBuild(
      selectedContract,
      'tact',
      true,
    );
    if (!output) return;

    const contractName = extractContractName(selectedContract);

    const _code = `async function main() {
      ${output.finalJSoutput}
      const contractInit  = await ${contractName}.fromAddress(window.TonCore.Address.parse('${activeProject.contractAddress}'));
      return contractInit;
    } return main()`;
    //  TODO: Find a better solution may be worker or js sandbox
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const contractInit = await new Function(_code)();
    window.contractInit = contractInit;

    const endpoint = tonHttpEndpoint({
      network: environment.toLocaleLowerCase() as Network,
    });

    const client = new TonClient({ endpoint });
    const _userContract = client.open(contractInit);
    updateContract(_userContract);
  };

  const autoSelectFirstContract = () => {
    const _contractsToDeploy = contractsToDeploy();
    if (_contractsToDeploy.length > 0 && !selectedContract) {
      deployForm.setFieldsValue({
        contract: _contractsToDeploy[0]?.path, // Set the first contract as default
      });
      updateSelectedContract(_contractsToDeploy[0]?.path);
    }
  };

  useEffect(() => {
    updateABI().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract, contract]);

  useEffect(() => {
    try {
      updateContractInstance().catch(() => {});
    } catch (e) {
      /* empty */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract]);

  useEffect(() => {
    if (activeProject?.network) {
      setEnvironment(activeProject.network);
    }
    if (activeProject?.selectedContract) {
      setSelectedContract(activeProject.selectedContract);
      deployForm.setFieldsValue({ contract: activeProject.selectedContract });
    }
    const handler = (
      event: MessageEvent<{
        name: string;
        type: string;
        data: { data: Cell } | null;
        error: string;
      }>,
    ) => {
      if (
        typeof event.data !== 'object' ||
        event.data.type !== 'state-init-data' ||
        event.data.name !== 'ton-web-ide'
      ) {
        return;
      }
      if (event.data.error) {
        setIsLoading('');
        createLog(event.data.error, 'error');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBuildoutput((t: any) => {
        const oldState = typeof t === 'object' ? t : {};
        return {
          ...oldState,
          dataCell: event.data.data ?? '//',
        };
      });
    };

    if (activeProject?.language === 'tact') {
      const abiFields = getABIInputValues('init', 'Init');
      if (abiFields) {
        deployForm.setFieldsValue(abiFields);
      }
    }

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  useEffect(() => {
    if (!buildOutput?.dataCell || !isLoading) {
      return;
    }
    deploy().catch(() => {});
  }, [buildOutput?.dataCell]);

  useEffect(() => {
    if (buildCount === 0) return;
    autoSelectFirstContract();
  }, [buildCount]);

  return (
    <div className={`${s.root} onboarding-build-deploy`}>
      <h3 className={s.heading}>Build & Deploy</h3>
      <iframe
        className={`${s.cellBuilderRef} cell-builder-ref`}
        ref={cellBuilderRef}
        src="/html/tonweb.html"
        sandbox="allow-scripts  allow-same-origin"
      />
      <Form.Item
        label="Environment"
        className={`${s.formItem} select-search-input-dark`}
      >
        <Select
          value={environment}
          onChange={(value) => {
            updatNetworkEnvironment(value as NetworkEnvironment);
          }}
          options={[
            { value: 'SANDBOX', label: 'Sandbox' },
            { value: 'TESTNET', label: 'Testnet' },
            { value: 'MAINNET', label: 'Mainnet' },
          ]}
        />
      </Form.Item>

      {environment !== 'SANDBOX' && <TonAuth />}
      {getConnectedWallet()}

      <div className={s.actionWrapper}>
        <ExecuteFile
          projectId={projectId as string}
          icon="Build"
          label={
            environment === 'SANDBOX' && activeProject?.language !== 'tact'
              ? 'Build'
              : 'Build'
          }
          description={`- Select a contract to build <br /> 
            ${
              isAutoBuildAndDeployEnabled()
                ? '- Auto-build and deploy is enabled for Sandbox and can be changed in settings. <br />'
                : ''
            }
            ${
              activeProject?.language === 'tact' &&
              '<br />- Tact version: ' + tactVersion
            }
            `}
          allowedFile={['fc', 'tact']}
          onCompile={() => {
            EventEmitter.emit('SET_SIDEBAR_VISIBILITY', false);

            (async () => {
              if (
                environment == 'SANDBOX' &&
                activeProject?.language === 'tact'
              ) {
                setBuildCount((prevCount) => prevCount + 1);
                if (selectedContract) {
                  await delay(500);
                  updateABI().catch(() => {});
                }
                if (!isAutoBuildAndDeployEnabled()) return;
                await delay(200);
                deployForm.submit();
              }
            })().catch(() => {});
          }}
        />
        {deployView()}
      </div>

      {activeProject?.contractAddress && environment !== 'SANDBOX' && (
        <div className={`${s.contractAddress} wrap`}>
          <Link
            href={`https://${
              chain === CHAIN.TESTNET ? 'testnet.' : ''
            }tonviewer.com/${activeProject.contractAddress}`}
            target="_blank"
          >
            <AppIcon name="Eye" /> View Deployed Contract
          </Link>
        </div>
      )}

      {isContractInteraction() && (
        <div className={s.contractInteraction}>
          <ContractInteraction
            contractAddress={activeProject?.contractAddress ?? ''}
            projectId={projectId}
            abi={contractABI}
            network={environment}
            contract={contract as SandboxContract<UserContract> | null}
            language={activeProject?.language ?? 'func'}
          />
        </div>
      )}
    </div>
  );
};

export default BuildProject;
