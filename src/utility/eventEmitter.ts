import { LogEntry } from '@/interfaces/log.interface';
import EventEmitterDefault from 'eventemitter3';

const eventEmitter = new EventEmitterDefault();

export interface EventEmitterPayloads {
  ONBOARDING_NEW_PROJECT: { projectName: string };
  LOG_CLEAR: undefined;
  LOG: LogEntry;
  ON_SPLIT_DRAG_END: { position?: number };
  SAVE_FILE: undefined | { fileId: string; content: string };
  FORCE_UPDATE_FILE: string | { oldPath: string; newPath: string };
  FILE_SAVED: { filePath: string };
  FILE_RENAMED: { oldPath: string; newPath: string };
  TEST_CASE_LOG: string;
  RELOAD_PROJECT_FILES: string;
  OPEN_PROJECT: string;
  PROJECT_MIGRATED: undefined;
  SET_SIDEBAR_VISIBILITY: boolean; // This is for mobile view.
}

const EventEmitter = {
  on: <K extends keyof EventEmitterPayloads>(
    event: K,
    fn: (payload: EventEmitterPayloads[K]) => void,
  ) => eventEmitter.on(event, fn),
  once: <K extends keyof EventEmitterPayloads>(
    event: K,
    fn: (payload: EventEmitterPayloads[K]) => void,
  ) => eventEmitter.once(event, fn),
  off: <K extends keyof EventEmitterPayloads>(
    event: K,
    fn?: (payload: EventEmitterPayloads[K]) => void,
  ) => eventEmitter.off(event, fn),
  emit: <K extends keyof EventEmitterPayloads>(
    event: K,
    payload: EventEmitterPayloads[K] | null = null,
  ) => eventEmitter.emit(event, payload),
};
Object.freeze(EventEmitter);

export default EventEmitter;
