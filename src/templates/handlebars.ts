import { type AsyncResult, FileSystemIOError, type Result, TemplateError, ValidationError, err, ok } from '../common';
import type { FilesystemAccessor } from '../env';
import type { Logger } from '../logging';
import type { TemplateRenderer, TemplateRendererContext } from './types';
import Handlebars from 'handlebars';
import path from 'node:path';
import type z from 'zod';

export interface TemplateHelper {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any;
}

export class HandlebarsTemplateEngine<S extends z.ZodObject> implements TemplateRenderer<z.infer<S>> {
  private readonly logger: Logger;
  private readonly fs: FilesystemAccessor;
  private readonly hbs: typeof Handlebars;

  constructor(
    context: TemplateRendererContext,
    private readonly schema: S,
    helpers: TemplateHelper[] = []
  ) {
    this.logger = context.logger.child({ module: 'template-engine' });
    this.fs = context.fs;
    this.hbs = Handlebars.create();
    for (const helper of helpers) {
      this.hbs.registerHelper(helper.name, helper.fn);
    }
  }

  private validateTemplateValues(templateValues: z.infer<S>): Result<z.infer<S>, ValidationError> {
    const parseResult = this.schema.safeParse(templateValues);
    if (!parseResult.success) return err(new ValidationError(parseResult.error.message));
    return ok(parseResult.data);
  }

  renderString(str: string, templateValues: z.infer<S>): Result<string, ValidationError> {
    const inputValidationResult = this.validateTemplateValues(templateValues);
    if (!inputValidationResult.success) return inputValidationResult;
    return inputValidationResult.map(input => this.hbs.compile(str)(input)).mapError(e => new TemplateError(e.message));
  }

  async renderFile(
    sourcePath: string,
    templateValues: z.infer<S>,
    destinationPath: string
  ): AsyncResult<string, ValidationError | FileSystemIOError | TemplateError> {
    this.logger.debug(`renderFile src=${sourcePath} dest=${destinationPath}`);

    const fileReadResult = await this.fs.readFile(sourcePath);
    if (!fileReadResult.success) return fileReadResult;

    const renderResult = this.renderString(fileReadResult.data, templateValues);
    if (!renderResult.success) return renderResult;

    const writeResult = await this.fs.writeFile(destinationPath, renderResult.data);
    if (!writeResult.success) return writeResult;

    return renderResult;
  }

  async renderDir(
    sourcePath: string,
    templateValues: z.infer<S>,
    destinationPath: string
  ): AsyncResult<string, ValidationError | FileSystemIOError | TemplateError> {
    this.logger.debug(`renderDir src=${sourcePath} dest=${destinationPath}`);

    const inputValidationResult = this.validateTemplateValues(templateValues);
    if (!inputValidationResult.success) return inputValidationResult;

    const mkdirResult = await this.fs.mkdir(destinationPath, { recursive: true });
    if (!mkdirResult.success) return mkdirResult;

    const entriesResult = await this.fs.readdir(sourcePath, { withFileTypes: true });
    if (!entriesResult.success) return entriesResult;

    for (const entry of entriesResult.data) {
      const srcPath = path.join(sourcePath, entry.name);
      const destPath = path.join(destinationPath, entry.name);

      if (entry.isDirectory()) {
        const r = await this.renderDir(srcPath, templateValues, destPath);
        if (!r.success) return r;
      } else {
        const r = await this.renderFile(srcPath, inputValidationResult.data, destPath);
        if (!r.success) return r;
      }
    }

    this.logger.debug(`renderDir completed dest=${destinationPath}`);
    return ok('');
  }
}
