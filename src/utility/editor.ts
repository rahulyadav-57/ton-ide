import { ContractLanguage } from '@/interfaces/workspace.interface';
import { loader } from '@monaco-editor/react';
import { highlightCodeSnippets } from './syntaxHighlighter';
import { fileTypeFromFileName } from './utils';

export async function configureMonacoEditor(path: string) {
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
  await highlightCodeSnippets(
    loader,
    fileTypeFromFileName(path) as ContractLanguage,
  );
}