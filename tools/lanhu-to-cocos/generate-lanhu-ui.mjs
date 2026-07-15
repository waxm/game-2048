#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_DESIGN_SIZE = { width: 640, height: 1136 };
const SUPPORTED_TYPES = new Set(["image", "text", "button"]);

function main() {
    const inputPath = process.argv[2];

    if (!inputPath) {
        fail("Usage: node tools/lanhu-to-cocos/generate-lanhu-ui.mjs <input.json>");
    }

    const projectRoot = findProjectRoot(process.cwd());
    const spec = readJson(path.resolve(process.cwd(), inputPath));
    const normalized = normalizeSpec(spec);
    const outputDir = path.join(projectRoot, "assets/app/ui/lanhu");
    const outputPath = path.join(outputDir, `${normalized.name}.ts`);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, renderPanelScript(normalized), "utf8");

    console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
}

function findProjectRoot(startDir) {
    let current = startDir;

    while (true) {
        if (fs.existsSync(path.join(current, "assets")) && fs.existsSync(path.join(current, "package.json"))) {
            return current;
        }

        const parent = path.dirname(current);

        if (parent === current) {
            fail("Could not find Cocos project root. Run this command inside the project.");
        }

        current = parent;
    }
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        fail(`Failed to read JSON: ${filePath}\n${error.message}`);
    }
}

function normalizeSpec(spec) {
    const name = toPascalCase(requiredString(spec.name, "name"));
    const size = {
        width: Number(spec.size?.width ?? DEFAULT_DESIGN_SIZE.width),
        height: Number(spec.size?.height ?? DEFAULT_DESIGN_SIZE.height),
    };
    const coordinate = spec.coordinate ?? "top-left";

    if (coordinate !== "top-left" && coordinate !== "center") {
        fail(`Unsupported coordinate system: ${coordinate}`);
    }

    if (!Array.isArray(spec.nodes)) {
        fail("Input JSON must contain a nodes array.");
    }

    const nodes = spec.nodes.map((node, index) => normalizeNode(node, index, size, coordinate));
    return { name, size, coordinate, nodes };
}

function normalizeNode(node, index, size, coordinate) {
    const name = toPascalCase(requiredString(node.name, `nodes[${index}].name`));
    const type = requiredString(node.type, `nodes[${index}].type`).toLowerCase();

    if (!SUPPORTED_TYPES.has(type)) {
        fail(`Unsupported node type "${type}" at nodes[${index}].type`);
    }

    const width = Number(node.width ?? 0);
    const height = Number(node.height ?? 0);
    const position = readPosition(node, size, width, height, coordinate);

    return {
        name,
        fieldName: toCamelCase(name),
        handlerName: `on${name}Click`,
        type,
        width,
        height,
        x: round(position.x),
        y: round(position.y),
        text: String(node.text ?? ""),
        fontSize: Number(node.fontSize ?? 24),
        color: parseColor(node.color ?? "#ffffff"),
    };
}

function readPosition(node, size, width, height, coordinate) {
    if (coordinate === "center") {
        return {
            x: Number(node.x ?? 0),
            y: Number(node.y ?? 0),
        };
    }

    const left = Number(node.left ?? node.x ?? 0);
    const top = Number(node.top ?? node.y ?? 0);

    return {
        x: left + width / 2 - size.width / 2,
        y: size.height / 2 - top - height / 2,
    };
}

function renderPanelScript(spec) {
    const imports = collectImports(spec);
    const propertyBlocks = spec.nodes.map(renderProperty).join("\n\n");
    const builderCalls = spec.nodes.map(renderBuilderCall).join("\n");
    const bindLines = spec.nodes.filter((node) => node.type === "button").map((node) => {
        return `        this.${node.fieldName}?.node.on(Button.EventType.CLICK, this.${node.handlerName}, this);`;
    }).join("\n");
    const unbindLines = spec.nodes.filter((node) => node.type === "button").map((node) => {
        return `        this.${node.fieldName}?.node.off(Button.EventType.CLICK, this.${node.handlerName}, this);`;
    }).join("\n");
    const handlers = spec.nodes.filter((node) => node.type === "button").map(renderHandler).join("\n\n");

    return `${imports}
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/**
 * Generated from Lanhu design data.
 *
 * Source size: ${spec.size.width} x ${spec.size.height}
 * Coordinate system: ${spec.coordinate}
 */
@ccclass("${spec.name}")
export class ${spec.name} extends UIBase {
    private _viewBuilt = false;

    private _eventsBound = false;

${propertyBlocks}

    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.buildView();
        this.bindEvents();
    }

    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    private buildView(): void {
        if (this._viewBuilt) {
            return;
        }

        this._viewBuilt = true;
        this.node.name = "${spec.name}";
        this.ensureTransform(this.node, ${spec.size.width}, ${spec.size.height});
${builderCalls}
    }

    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
${bindLines || "        // No button events generated."}
    }

    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
${unbindLines || "        // No button events generated."}
    }

    private createImageNode(name: string, x: number, y: number, width: number, height: number): Sprite {
        const node = this.createChild(name, x, y, width, height);
        return node.addComponent(Sprite);
    }

    private createTextNode(name: string, x: number, y: number, width: number, height: number, text: string, fontSize: number, color: Color): Label {
        const node = this.createChild(name, x, y, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        label.color = color;
        return label;
    }

    private createButtonNode(name: string, x: number, y: number, width: number, height: number): Button {
        const node = this.createChild(name, x, y, width, height);
        node.addComponent(Sprite);
        return node.addComponent(Button);
    }

    private createChild(name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setPosition(new Vec3(x, y, 0));
        this.ensureTransform(node, width, height);
        this.node.addChild(node);
        return node;
    }

    private ensureTransform(node: Node, width: number, height: number): UITransform {
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
    }

${handlers || "    // No button handlers generated."}
}
`;
}

function collectImports(spec) {
    const names = new Set(["_decorator", "Color", "Node", "UITransform", "Vec3"]);

    for (const node of spec.nodes) {
        if (node.type === "image") {
            names.add("Sprite");
        }

        if (node.type === "text") {
            names.add("Label");
        }

        if (node.type === "button") {
            names.add("Button");
            names.add("Sprite");
        }
    }

    return `import { ${Array.from(names).sort().join(", ")} } from "cc";`;
}

function renderProperty(node) {
    const typeName = componentType(node);
    return `    @property({ type: ${typeName} })
    public ${node.fieldName}: ${typeName} | null = null;`;
}

function renderBuilderCall(node) {
    if (node.type === "text") {
        return `        this.${node.fieldName} = this.${node.fieldName} ?? this.createTextNode("${node.name}", ${node.x}, ${node.y}, ${node.width}, ${node.height}, ${quote(node.text)}, ${node.fontSize}, new Color(${node.color.r}, ${node.color.g}, ${node.color.b}, ${node.color.a}));`;
    }

    if (node.type === "button") {
        return `        this.${node.fieldName} = this.${node.fieldName} ?? this.createButtonNode("${node.name}", ${node.x}, ${node.y}, ${node.width}, ${node.height});`;
    }

    return `        this.${node.fieldName} = this.${node.fieldName} ?? this.createImageNode("${node.name}", ${node.x}, ${node.y}, ${node.width}, ${node.height});`;
}

function renderHandler(node) {
    return `    private ${node.handlerName}(): void {
        // TODO: Bind ${node.name} click behavior.
    }`;
}

function componentType(node) {
    if (node.type === "text") {
        return "Label";
    }

    if (node.type === "button") {
        return "Button";
    }

    return "Sprite";
}

function parseColor(value) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) {
        fail(`Invalid color: ${value}. Use #rrggbb or #rrggbbaa.`);
    }

    return {
        r: Number.parseInt(value.slice(1, 3), 16),
        g: Number.parseInt(value.slice(3, 5), 16),
        b: Number.parseInt(value.slice(5, 7), 16),
        a: value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) : 255,
    };
}

function requiredString(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`Missing required string: ${label}`);
    }

    return value.trim();
}

function toPascalCase(value) {
    return value
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}

function toCamelCase(value) {
    const pascal = toPascalCase(value);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

function quote(value) {
    return JSON.stringify(value);
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main();
