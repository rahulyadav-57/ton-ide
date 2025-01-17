'use client';

import { ManageGit } from '@/components/git';
import { DownloadProject } from '@/components/project';
import { ProjectTemplate } from '@/components/template';
import { NonProductionNotice } from '@/components/ui';
import { AppConfig } from '@/config/AppConfig';
import { useFileTab } from '@/hooks';
import { useLogActivity } from '@/hooks/logActivity.hooks';
import { useProject } from '@/hooks/projectV2.hooks';
import { useSettingAction } from '@/hooks/setting.hooks';
import { Project, Tree } from '@/interfaces/workspace.interface';
import { Analytics } from '@/utility/analytics';
import EventEmitter from '@/utility/eventEmitter';
import * as TonCore from '@ton/core';
import * as TonCrypto from '@ton/crypto';
import { Blockchain } from '@ton/sandbox';
import { Buffer } from 'buffer';
import { useRouter } from 'next/router';
import { FC, useEffect, useMemo, useState } from 'react';
import Split from 'react-split';
import { useEffectOnce } from 'react-use';
import BottomPanel from '../BottomPanel/BottomPanel';
import BuildProject from '../BuildProject';
import Editor from '../Editor';
import CodeDiffViewer from '../Editor/CodeDiffViewer';
import Tabs from '../Tabs';
import TestCases from '../TestCases';
import WorkspaceSidebar from '../WorkspaceSidebar';
import { WorkSpaceMenu } from '../WorkspaceSidebar/WorkspaceSidebar';
import { globalWorkspace } from '../globalWorkspace';
import { ManageProject } from '../project';
import FileTree from '../tree/FileTree';
import ItemAction from '../tree/FileTree/ItemActions';
import s from './WorkSpace.module.scss';

const WorkSpace: FC = () => {
  const { clearLog, createLog } = useLogActivity();

  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<WorkSpaceMenu>('code');
  const [isLoaded, setIsLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contract, setContract] = useState<any>('');

  const { tab } = router.query;
  const {
    activeProject,
    setActiveProject,
    projectFiles,
    loadProjectFiles,
    newFileFolder,
  } = useProject();

  const { fileTab, open: openTab } = useFileTab();

  const { init: initGlobalSetting } = useSettingAction();

  const commitItemCreation = async (type: Tree['type'], name: string) => {
    if (!name) return;
    try {
      await newFileFolder(name, type);
    } catch (error) {
      createLog((error as Error).message, 'error');
    }
  };

  const createSandbox = async (force: boolean = false) => {
    if (globalWorkspace.sandboxBlockchain && !force) {
      return;
    }
    const blockchain = await Blockchain.create();
    globalWorkspace.sandboxBlockchain = blockchain;
    const wallet = await blockchain.treasury('user');
    globalWorkspace.sandboxWallet = wallet;
  };

  const openProject = async (selectedProjectPath: Project['id']) => {
    if (!selectedProjectPath) {
      createLog(`${selectedProjectPath} - project not found`, 'error');
      return;
    }
    await setActiveProject(selectedProjectPath);
    await loadProjectFiles(selectedProjectPath);
  };

  const cachedProjectPath = useMemo(() => {
    return activeProject?.path as string;
  }, [activeProject]);

  const onKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      EventEmitter.emit('SAVE_FILE');
    }
  };

  const reloadProjectFiles = async (projectPath: string) => {
    if (!projectPath) return;
    await loadProjectFiles(projectPath);
  };

  useEffect(() => {
    if (!cachedProjectPath) return;
    openProject(cachedProjectPath).catch(() => {});
  }, [cachedProjectPath]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }
    createLog(`Project '${activeProject.name}' is opened`);
    createSandbox(true).catch(() => {});

    if (fileTab.active) return;
    // Open main file on project switch
    const mainFile = projectFiles.find((file) =>
      ['main.tact', 'main.fc'].includes(file.name),
    );
    if (!mainFile) return;
    openTab(mainFile.name, mainFile.path);
  }, [cachedProjectPath]);

  useEffect(() => {
    document.addEventListener('keydown', onKeydown);
    EventEmitter.on('RELOAD_PROJECT_FILES', reloadProjectFiles);
    EventEmitter.on('OPEN_PROJECT', openProject);

    Analytics.track('Project Opened', {
      platform: 'IDE',
      type: 'TON-func',
    });

    return () => {
      try {
        document.removeEventListener('keydown', onKeydown);
        EventEmitter.off('RELOAD_PROJECT_FILES', reloadProjectFiles);
        EventEmitter.off('OPEN_PROJECT', openProject);
        clearLog();
      } catch (error) {
        /* empty */
      }
    };
  }, []);

  useEffect(() => {
    if (tab) {
      setActiveMenu(tab as WorkSpaceMenu);
    }
  }, [tab]);

  useEffectOnce(() => {
    setIsLoaded(true);
    initGlobalSetting();
    window.TonCore = TonCore;
    window.TonCrypto = TonCrypto;
    window.Buffer = Buffer;
  });

  return (
    <div className={`${s.root} show-file-icons`}>
      <div className={`${s.sidebar} onboarding-workspace-sidebar`}>
        <WorkspaceSidebar
          activeMenu={activeMenu}
          projectName={activeProject?.path ?? ''}
          onMenuClicked={(name) => {
            setActiveMenu(name);
            router
              .replace({
                query: { ...router.query, tab: name },
              })
              .catch(() => {});
          }}
        />
      </div>
      <Split
        className={s.splitHorizontal}
        minSize={250}
        gutterSize={4}
        sizes={[5, 95]}
        onDragEnd={() => {
          EventEmitter.emit('ON_SPLIT_DRAG_END');
        }}
      >
        <div className={s.tree}>
          {isLoaded && activeMenu === 'code' && (
            <div className="onboarding-file-explorer">
              <span className={s.heading}>Explorer</span>
              <ManageProject />
              {activeProject?.path && (
                <div className={s.globalAction}>
                  <span>{AppConfig.name}</span>
                  <div className={s.actionWrapper}>
                    <ItemAction
                      className={s.visible}
                      allowedActions={['NewFile', 'NewFolder']}
                      onNewFile={() => {
                        commitItemCreation('file', 'new file');
                      }}
                      onNewDirectory={() => {
                        commitItemCreation('directory', 'new folder');
                      }}
                    />
                    <DownloadProject
                      path={activeProject.path}
                      title={`Download ${activeProject.name}`}
                    />
                  </div>
                </div>
              )}

              <FileTree projectId={activeProject?.path as string} />
            </div>
          )}
          {activeMenu === 'build' && globalWorkspace.sandboxBlockchain && (
            <BuildProject
              projectId={activeProject?.path as string}
              onCodeCompile={(_codeBOC) => {}}
              contract={contract}
              updateContract={(contractInstance) => {
                setContract(contractInstance);
              }}
            />
          )}
          {activeMenu === 'test-cases' && (
            <div className={s.commonContainer}>
              <TestCases projectId={activeProject?.path as string} />
            </div>
          )}
          {activeMenu === 'git' && (
            <div className={s.commonContainer}>
              <ManageGit />
            </div>
          )}
        </div>
        <div className={`${s.workArea} onboarding-code-editor`}>
          {isLoaded && (
            <>
              <Split
                className={s.splitVertical}
                minSize={50}
                gutterSize={4}
                sizes={[80, 20]}
                direction="vertical"
                onDragEnd={() => {
                  EventEmitter.emit('ON_SPLIT_DRAG_END');
                }}
              >
                <div>
                  <NonProductionNotice />
                  <div className={s.tabsWrapper}>
                    <Tabs />
                  </div>
                  <div style={{ height: 'calc(100% - 43px)' }}>
                    {fileTab.active ? (
                      fileTab.active.type === 'git' ? (
                        <CodeDiffViewer />
                      ) : (
                        <Editor />
                      )
                    ) : (
                      <ProjectTemplate />
                    )}
                  </div>
                </div>
                <div>
                  <BottomPanel />
                </div>
              </Split>
            </>
          )}
        </div>
      </Split>
    </div>
  );
};

export default WorkSpace;
