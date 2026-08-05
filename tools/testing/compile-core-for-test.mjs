import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** 递归收集目录中的 TypeScript 源文件。 */
function collectTypeScriptFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

/** 把 TypeScript 诊断转换为便于定位的单行文本。 */
function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) {
    return message;
  }
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

/**
 * 重写转换结果中的模块路径。
 *
 * Node 不识别无扩展名的临时 ESM，因此相对引用统一补 `.mjs`；`cc` 则指向测试
 * 模拟模块。这里只处理 TypeScript 转换器生成的静态 import，不改动业务源码。
 */
function rewriteModuleSpecifiers(source, cocosMockUrl) {
  const rewrite = (_match, prefix, specifier, suffix) => {
    if (specifier === "cc") {
      return `${prefix}${cocosMockUrl}${suffix}`;
    }
    if (specifier.startsWith(".") && !path.posix.extname(specifier)) {
      return `${prefix}${specifier}.mjs${suffix}`;
    }
    return `${prefix}${specifier}${suffix}`;
  };

  return source
    .replace(/(from\s+["'])([^"']+)(["'])/g, rewrite)
    .replace(/(import\s+["'])([^"']+)(["'])/g, rewrite);
}

/**
 * 将核心 TypeScript 临时转换为 Node 可加载的 ESM。
 *
 * 输出目录位于系统临时目录，测试结束后由调用方删除，不会污染 Creator 工程。
 */
export function compileCoreForTest(projectRoot, cocosMockPath) {
  const sourceRoot = path.join(projectRoot, "assets/app/core");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workai-core-test-"));
  const cocosMockUrl = pathToFileURL(cocosMockPath).href;

  for (const sourcePath of collectTypeScriptFiles(sourceRoot)) {
    const source = fs.readFileSync(sourcePath, "utf8");
    const result = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length > 0) {
      throw new Error(errors.map(formatDiagnostic).join("\n"));
    }

    const relativePath = path.relative(sourceRoot, sourcePath);
    const outputPath = path.join(
      outputRoot,
      relativePath.replace(/\.ts$/, ".mjs"),
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      rewriteModuleSpecifiers(result.outputText, cocosMockUrl),
      "utf8",
    );
  }

  return {
    /** 动态载入一份已经转换的核心模块。 */
    importModule(relativePath) {
      const modulePath = path.join(
        outputRoot,
        relativePath.replace(/\.ts$/, ".mjs"),
      );
      return import(pathToFileURL(modulePath).href);
    },

    /** 删除本轮测试生成的临时模块。 */
    cleanup() {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    },
  };
}

/**
 * 将明确列出的应用 TypeScript 源码临时转换为 Node 可加载的 ESM。
 *
 * 业务系统测试只编译真实依赖闭包，既避免引入无关 UI，也能继续复用与核心测试相同的
 * Cocos 模拟器和模块路径改写规则。
 */
export function compileAppFilesForTest(
  projectRoot,
  cocosMockPath,
  relativePaths,
) {
  const sourceRoot = path.join(projectRoot, "assets/app");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workai-app-test-"));
  const cocosMockUrl = pathToFileURL(cocosMockPath).href;

  for (const relativePath of relativePaths) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const source = fs.readFileSync(sourcePath, "utf8");
    const result = ts.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length > 0) {
      throw new Error(errors.map(formatDiagnostic).join("\n"));
    }

    const outputPath = path.join(
      outputRoot,
      relativePath.replace(/\.ts$/, ".mjs"),
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      rewriteModuleSpecifiers(result.outputText, cocosMockUrl),
      "utf8",
    );
  }

  return {
    /** 动态载入一份已经转换的应用模块。 */
    importModule(relativePath) {
      const modulePath = path.join(
        outputRoot,
        relativePath.replace(/\.ts$/, ".mjs"),
      );
      return import(pathToFileURL(modulePath).href);
    },

    /** 删除本轮测试生成的临时模块。 */
    cleanup() {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    },
  };
}
