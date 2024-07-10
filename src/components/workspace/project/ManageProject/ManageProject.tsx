import { NewProject } from '@/components/project';
import { Tooltip } from '@/components/ui';
import AppIcon from '@/components/ui/icon';
import { useWorkspaceActions } from '@/hooks/workspace.hooks';
import { Project } from '@/interfaces/workspace.interface';
import { Button, Modal, Select, message } from 'antd';
import { useRouter } from 'next/router';
import { FC, useEffect, useState } from 'react';
import s from './ManageProject.module.scss';

const ManageProject: FC = () => {
  const { project, projects, deleteProject } = useWorkspaceActions();
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const router = useRouter();
  const { id: projectId, importURL } = router.query;

  const projectHeader = () => (
    <>
      <span className={s.heading}>Projects</span>
      <div className={s.options}>
        <NewProject />
        <NewProject
          label="Import"
          projectType="git"
          heading="Import from GitHub"
          icon="GitHub"
          className={s.git}
          active={!!importURL}
        />
        <NewProject
          label="Import"
          projectType="local"
          heading="Import from local"
          icon="Import"
          className={s.local}
        />

        <Tooltip title="Delete Project" placement="bottom">
          <div
            className={`${s.deleteProject} ${
              !currentProject ? s.disabled : ''
            }`}
            onClick={() => {
              if (!currentProject) return;
              setIsDeleteConfirmOpen(true);
            }}
          >
            <AppIcon name="Delete" />
          </div>
        </Tooltip>
      </div>
    </>
  );

  const projectOptions = () => (
    <div className={s.projects}>
      <Select
        placeholder="Select a project"
        showSearch
        className="w-100 select-search-input-dark"
        value={currentProject?.id}
        onChange={(_project) => {
          openProject(_project).catch(() => {});
        }}
        notFoundContent="No project found"
        filterOption={(inputValue, option) => {
          return option?.title.toLowerCase().includes(inputValue.toLowerCase());
        }}
      >
        {[...projects()].reverse().map((project) => (
          <Select.Option
            key={project.id}
            value={project.id}
            title={project.name}
          >
            {project.name} - <span>{project.language ?? 'func'}</span>
          </Select.Option>
        ))}
      </Select>
    </div>
  );

  const noProjectExistsUI = () => (
    <div className={s.startNew}>
      <span className={s.title}>Begin by initiating a new project</span>
      <NewProject ui="button" className={s.newProject} icon="Plus" />
    </div>
  );

  const hasProjects = () => {
    return projects().length > 0;
  };

  const deleteSelectedProject = async (id: Project['id']) => {
    try {
      await deleteProject(id);
      setCurrentProject(null);
      setIsDeleteConfirmOpen(false);
      await router.push('/');
    } catch (error) {
      await message.error('Failed to delete project');
    }
  };

  const openProject = async (id: Project['id']) => {
    if (!id) return;
    const selectedProject = project(id as string);
    if (!selectedProject) {
      await message.error('Project not found');
      return;
    }
    setCurrentProject(selectedProject);
    await router.push(`/project/${selectedProject.id}`);
  };

  useEffect(() => {
    if (!projectId || currentProject?.id == projectId) return;
    openProject(projectId as string).catch(() => {});
  }, [projectId]);

  return (
    <div className={s.root}>
      <div className={s.header}>
        {hasProjects() && projectHeader()}
        {!hasProjects() && noProjectExistsUI()}
      </div>
      {hasProjects() && projectOptions()}

      <Modal
        className="modal-delete-project"
        open={isDeleteConfirmOpen}
        closable={false}
        footer={null}
      >
        <span className={s.modalTitle}>
          <AppIcon name="Info" /> Delete my <b>`{currentProject?.name}`</b>{' '}
          Project?
        </span>
        <div className={s.modalDescription}>
          <p>
            <b>Are you sure you want to delete?</b>
          </p>
          <div className={s.checklist}>
            <span>- This action is irreversable!</span>
            <span>- All files and folders will be deleted.</span>
          </div>
        </div>
        <div className={s.actions}>
          <Button
            className={`${s.btnAction} ${s.cancel}`}
            type="primary"
            onClick={() => {
              setIsDeleteConfirmOpen(false);
            }}
          >
            <AppIcon name="Close" className={s.icon} />
            Cancel
          </Button>
          <Button
            className={s.btnAction}
            type="primary"
            danger
            onClick={() => {
              if (currentProject) {
                deleteSelectedProject(currentProject.id).catch(() => {});
              }
            }}
          >
            <AppIcon name="Delete" />
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default ManageProject;
