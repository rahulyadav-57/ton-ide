import { useSettingAction } from '@/hooks/setting.hooks';
import { ContractLanguage, Tree } from '@/interfaces/workspace.interface';
import EventEmitter from '@/utility/eventEmitter';
import { highlightCodeSnippets } from '@/utility/syntaxHighlighter';
import { delay, fileTypeFromFileName } from '@/utility/utils';
import EditorDefault, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { FC, useEffect, useRef, useState } from 'react';
// import { useLatest } from 'react-use';
import { useTheme } from '@/components/shared/ThemeProvider';
import AppIcon from '@/components/ui/icon';
import { useFile, useFileTab } from '@/hooks';
import { useProject } from '@/hooks/projectV2.hooks';
import { useLatest } from 'react-use';
import ReconnectingWebSocket from 'reconnecting-websocket';
import s from './Editor.module.scss';
import { editorOnMount } from './EditorOnMount';
type Monaco = typeof monaco;

interface Props {
  className?: string;
}

const Editor: FC<Props> = ({ className = '' }) => {
  const { activeProject } = useProject();
  const { getFile, saveFile: storeFileContent } = useFile();
  const { fileTab, updateFileDirty } = useFileTab();
  const { theme } = useTheme();

  const { isFormatOnSave, getSettingStateByKey } = useSettingAction();

  const [isLoaded, setIsLoaded] = useState(false);
  const [isEditorInitialized, setIsEditorInitialized] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const editorMode = getSettingStateByKey('editorMode');

  // Using this extra state to trigger save file from js event
  const [saveFileCounter, setSaveFileCounter] = useState(1);
  const latestFile = useLatest(fileTab.active);

  const [initialFile, setInitialFile] = useState<Pick<
    Tree,
    'id' | 'content'
  > | null>(null);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const vimStatusBarRef = useRef<HTMLElement | null>(null);
  const vimModeRef = useRef<{
    dispose: () => void;
  } | null>(null);

  // eslint-disable-next-line prefer-const
  let lspWebSocket: ReconnectingWebSocket | null;

  const saveFile = async () => {
    const fileContent = editorRef.current?.getValue() ?? '';
    if (!fileContent || !fileTab.active) return;
    try {
      if (isFormatOnSave()) {
        editorRef.current?.trigger(
          'editor',
          'editor.action.formatDocument',
          {},
        );
        await delay(200);
      }
      await storeFileContent(fileTab.active, fileContent);
      EventEmitter.emit('FILE_SAVED', { filePath: fileTab.active });
    } catch (error) {
      /* empty */
    }
  };

  const updateFileSaveCounter = () => {
    setSaveFileCounter((prev) => prev + 1);
  };

  useEffect(() => {
    async function loadMonacoEditor() {
      const monaco = await import('monaco-editor');

      window.MonacoEnvironment.getWorkerUrl = (_: string, label: string) => {
        if (label === 'typescript') {
          return '/_next/static/ts.worker.js';
        } else if (label === 'json') {
          return '/_next/static/json.worker.js';
        }
        return '/_next/static/editor.worker.js';
      };
      loader.config({ monaco });
      if (!fileTab.active) return;
      await highlightCodeSnippets(
        loader,
        fileTypeFromFileName(fileTab.active) as ContractLanguage,
      );
    }

    loadMonacoEditor()
      .then(() => {
        setIsLoaded(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Don't save file on initial render
    if (saveFileCounter === 1) return;

    const saveFileDebouce = setTimeout(() => {
      (async () => {
        await saveFile();
      })().catch(() => {});
    }, 300);

    return () => {
      clearTimeout(saveFileDebouce);
    };
  }, [saveFileCounter]);

  useEffect(() => {
    if (!isLoaded) return;
    EventEmitter.on('SAVE_FILE', updateFileSaveCounter);

    // If file is changed e.g. in case of build process then force update in editor
    EventEmitter.on('FORCE_UPDATE_FILE', (file) => {
      if (
        !activeProject?.path ||
        (latestFile.current?.includes('setting.json') &&
          typeof file == 'string')
      )
        return;

      (async () => {
        const filePath = typeof file === 'string' ? file : file.newPath;
        if (filePath !== latestFile.current) return;
        await fetchFileContent(true);
      })().catch((error) => {
        console.error('Error handling FORCE_UPDATE_FILE event:', error);
      });
    });
    return () => {
      EventEmitter.off('SAVE_FILE', updateFileSaveCounter);
      EventEmitter.off('FORCE_UPDATE_FILE');
    };
  }, [isLoaded]);

  const fetchFileContent = async (force = false) => {
    if (!fileTab.active) return;
    if ((!fileTab.active || fileTab.active === initialFile?.id) && !force)
      return;
    let content = (await getFile(fileTab.active)) as string;
    if (!editorRef.current) return;
    let modelContent = editorRef.current.getValue();

    if (force) {
      editorRef.current.setValue(content);
      modelContent = content;
    }
    if (modelContent) {
      content = modelContent;
    } else {
      editorRef.current.setValue(content);
    }
    setInitialFile({ id: fileTab.active, content });
    editorRef.current.focus();
  };

  const markFileDirty = () => {
    if (!editorRef.current) return;
    const fileContent = editorRef.current.getValue();
    if (
      fileTab.active !== initialFile?.id ||
      !initialFile.content ||
      initialFile.content === fileContent
    ) {
      return;
    }
    if (!fileContent) {
      return;
    }
    updateFileDirty(fileTab.active, true);
  };

  const initializeEditorMode = async () => {
    if (!editorRef.current || !vimStatusBarRef.current) return;

    if (editorMode === 'vim') {
      const { initVimMode } = await import('monaco-vim');
      vimModeRef.current = initVimMode(
        editorRef.current,
        vimStatusBarRef.current as unknown as HTMLElement,
      );
    } else {
      vimModeRef.current?.dispose();
    }
  };

  useEffect(() => {
    if (editorRef.current) {
      initializeEditorMode().catch(() => {});
    }
    return () => {
      vimModeRef.current?.dispose();
    };
  }, [editorMode]);

  useEffect(() => {
    if (!isEditorInitialized) {
      return;
    }
    (async () => {
      await fetchFileContent();
    })().catch(() => {});
  }, [fileTab.active, isEditorInitialized]);

  useEffect(() => {
    if (!monacoRef.current) {
      return;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monacoRef.current]);

  useEffect(() => {
    window.onbeforeunload = () => {
      // On page reload/exit, close web socket connection
      lspWebSocket?.close();
    };
    return () => {
      vimModeRef.current?.dispose();
      lspWebSocket?.close();
    };
  }, []);

  if (!isLoaded) {
    return <div className={`${s.container} ${className}`}>Loading...</div>;
  }

  return (
    <div className={`${s.container} ${className}`}>
      <span className={s.saveFile} onClick={updateFileSaveCounter}>
        <AppIcon name="Save" />
      </span>
      <div className={s.editorInfo}>
        <div>
          <span className={s.vimStatuBar} ref={vimStatusBarRef} />
        </div>
        <span>
          Ln {cursorPosition[0]}, Col {cursorPosition[1]}
        </span>
      </div>
      <EditorDefault
        className={s.editor}
        path={fileTab.active ?? ''}
        theme={theme === 'dark' ? 'vs-theme-dark' : 'light'}
        // height="90vh"
        defaultLanguage={fileTypeFromFileName(fileTab.active ?? '')}
        // defaultLanguage={`func`}
        defaultValue={undefined}
        onChange={markFileDirty}
        options={{
          minimap: {
            enabled: false,
          },
          scrollbar: {
            verticalScrollbarSize: 5,
            horizontalScrollbarSize: 5,
          },
          lineNumbersMinChars: 3,
          fontSize: 14,
          bracketPairColorization: {
            enabled: true,
          },
        }}
        onMount={(editor, monaco) => {
          (async () => {
            editorRef.current = editor;
            monacoRef.current = monaco;

            setIsEditorInitialized(true);
            await editorOnMount(editor, monaco);
            await initializeEditorMode();
            editor.onDidChangeCursorPosition(() => {
              const position = editor.getPosition();
              if (position) {
                setCursorPosition([position.lineNumber, position.column]);
              }
            });
            const { startLSP } = await import('./lsp');
            await startLSP(editor, monaco, lspWebSocket);
          })().catch((error) => {
            console.error('Error in onMount:', error);
          });
        }}
      />
    </div>
  );
};

export default Editor;
