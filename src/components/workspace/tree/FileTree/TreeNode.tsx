import { useLogActivity } from '@/hooks/logActivity.hooks';
import { useProject } from '@/hooks/projectV2.hooks';
import { useWorkspaceActions } from '@/hooks/workspace.hooks';
import { Project, Tree } from '@/interfaces/workspace.interface';
import { fileTypeFromFileName } from '@/utility/utils';
import { NodeModel } from '@minoru/react-dnd-treeview';
import cn from 'clsx';
import { useRouter } from 'next/router';
import { FC, useState } from 'react';
import s from './FileTree.module.scss';
import ItemAction, { actionsTypes } from './ItemActions';
import TreePlaceholderInput from './TreePlaceholderInput';

interface Props {
  node: NodeModel<TreeNodeData>;
  depth: number;
  isOpen: boolean;
  onToggle: (id: NodeModel['id']) => void;
  projectId: Project['id'];
}

export interface TreeNodeData {
  path: string;
}

const TreeNode: FC<Props> = ({ node, depth, isOpen, onToggle }) => {
  const { droppable } = node;
  const indent = (depth + 1) * 15;

  const [isEditing, setIsEditing] = useState(false);
  const [newItemAdd, setNewItemAdd] = useState<Tree['type'] | ''>('');

  const router = useRouter();
  const { id: projectId } = router.query;

  const { openFile, isProjectEditable } = useWorkspaceActions();
  const { deleteProjectFile, renameProjectFile, newFileFolder } = useProject();
  const { createLog } = useLogActivity();

  const disallowedFile = [
    'message.cell.ts',
    'stateInit.cell.ts',
    'test.spec.js',
    'setting.json',
  ];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node.id);
    if (!node.droppable) {
      openFile(node.id as string, projectId as string);
    }
  };

  const handleItemAction = () => {
    if (!isAllowed()) {
      return;
    }
    setIsEditing(true);
  };

  const commitEditing = async (name: string) => {
    try {
      await renameProjectFile(node.data?.path as string, name);
      reset();
    } catch (error) {
      createLog((error as Error).message, 'error');
    }
  };

  const commitItemCreation = async (name: string) => {
    if (!newItemAdd) return;
    const path = `${node.data?.path}/${name}`;
    try {
      await newFileFolder(path, newItemAdd);
      reset();
    } catch (error) {
      createLog((error as Error).message, 'error');
    }
  };

  const updateItemTypeCreation = (type: Tree['type']) => {
    if (!isAllowed()) return;
    if (node.droppable && !isOpen) {
      onToggle(node.id);
    }
    setNewItemAdd(type);
  };

  const reset = () => {
    document.body.classList.remove('editing-file-folder');
    setNewItemAdd('');
    setIsEditing(false);
  };

  const isSystemFile = (fileName: string) => {
    return disallowedFile.includes(fileName);
  };

  const getAllowedActions = () => {
    if (isSystemFile(node.text)) {
      return [];
    }
    if (node.droppable) {
      return ['Edit', 'NewFile', 'NewFolder', 'Close'];
    }
    return ['Edit', 'Close'];
  };

  const deleteItemFromNode = async () => {
    const nodePath = node.data?.path;
    if (!nodePath) {
      createLog(`'${nodePath}' not found`, 'error');
      return;
    }

    await deleteProjectFile(nodePath);
  };

  const isAllowed = () => {
    const isEditingItem = document.body.classList.contains(
      'editing-file-folder',
    );
    if (!isEditingItem) {
      document.body.classList.add('editing-file-folder');
      return true;
    }
    return false;
  };

  const rootClassName = cn(s.treeNode, {
    [s.isOpen]: isOpen,
    'folder-name monaco-icon-label': true,
    'file-icon': !droppable,
    'folder-icon': droppable,
    'folder-icon-open': droppable && isOpen,
    [`${node.text.split('.').pop()}-lang-file-icon`]: !droppable,
    [`${fileTypeFromFileName(node.text)}-lang-file-icon`]: !droppable,
  });

  return (
    <>
      <div
        className={rootClassName}
        style={{ paddingInlineStart: indent }}
        onClick={handleClick}
      >
        {!isEditing && (
          <div
            className={`${s.item} ${
              isSystemFile(node.text) ? s.systemFile : ''
            }`}
          >
            <span>{node.text}</span>
            {isProjectEditable() && (
              <ItemAction
                className={s.actions}
                onRename={() => {
                  handleItemAction();
                }}
                allowedActions={getAllowedActions() as actionsTypes[]}
                onNewFile={() => {
                  updateItemTypeCreation('file');
                }}
                onNewDirectory={() => {
                  updateItemTypeCreation('directory');
                }}
                onDelete={() => {
                  deleteItemFromNode().catch(() => {});
                }}
              />
            )}
          </div>
        )}

        {isEditing && (
          <TreePlaceholderInput
            type={node.droppable ? 'directory' : 'file'}
            defaultValue={node.text}
            onSubmit={commitEditing}
            onCancel={reset}
          />
        )}
      </div>
      {newItemAdd && (
        <TreePlaceholderInput
          style={{ paddingInlineStart: 15 * (depth + 2) }}
          onSubmit={commitItemCreation}
          onCancel={reset}
          type={newItemAdd}
        />
      )}
    </>
  );
};

export default TreeNode;
