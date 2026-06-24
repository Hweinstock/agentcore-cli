import type { AsyncResult, FileSystemIOError, Result, TemplateError, ValidationError } from '../../common';
import type { FilesystemAccessor } from '../../env';
import type { Logger } from '../../logging';

export interface TemplateRendererContext {
  logger: Logger;
  fs: FilesystemAccessor;
}

/**
 * This is the general interface over handlebars that manages the rendering of templates.
 */
export interface TemplateRenderer<T> {
  renderString(str: string, templateValues: T): Result<string, ValidationError | TemplateError>;
  renderFile(
    sourcePath: string,
    templateValues: T,
    destinationPath: string
  ): AsyncResult<string, ValidationError | FileSystemIOError | TemplateError>;
  renderDir(
    sourcePath: string,
    templateValues: T,
    destinationPath: string
  ): AsyncResult<string, ValidationError | FileSystemIOError | TemplateError>;
}
