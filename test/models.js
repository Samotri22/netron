
/* eslint-env es2017 */

const fs = require('fs');
const path = require('path');
const process = require('process');

const base = require('../source/base');
const view = require('../source/view');
const zip = require('../source/zip');
const tar = require('../source/tar');

global.protobuf = require('../source/protobuf');
global.flatbuffers = require('../source/flatbuffers');
global.TextDecoder = TextDecoder;

const patterns = process.argv.length > 2 ? process.argv.slice(2) : [];
const targets = JSON.parse(fs.readFileSync(__dirname + '/models.json', 'utf-8')).reverse();

const host = {};

host.TestHost = class {

    constructor() {
        this._window = global.window;
        this._document = this._window.document;
        this._sourceDir = path.join(__dirname, '..', 'source');
    }

    get window() {
        return this._window;
    }

    get document() {
        return this._document;
    }

    async view(/* view */) {
    }

    start() {
    }

    environment(name) {
        if (name == 'zoom') {
            return 'none';
        }
        return null;
    }

    screen(/* name */) {
    }

    async require(id) {
        const file = path.join(this._sourceDir, id + '.js');
        return require(file);
    }

    async request(file, encoding, basename) {
        const pathname = path.join(basename || this._sourceDir, file);
        if (!fs.existsSync(pathname)) {
            throw new Error("The file '" + file + "' does not exist.");
        }
        if (encoding) {
            return fs.readFileSync(pathname, encoding);
        }
        const buffer = fs.readFileSync(pathname, null);
        return new base.BinaryStream(buffer);
    }

    event_ua(/* category, action, label, value */) {
    }

    event(/* name, params */) {
    }

    exception(err /*, fatal */) {
        throw err;
    }
};

host.TestHost.Context = class {

    constructor(host, folder, identifier, stream, entries) {
        this._host = host;
        this._folder = folder;
        this._identifier = identifier;
        this._stream = stream;
        this._entries = entries;
    }

    get identifier() {
        return this._identifier;
    }

    get stream() {
        return this._stream;
    }

    get entries() {
        return this._entries;
    }

    request(file, encoding, base) {
        return this._host.request(file, encoding, base === undefined ? this._folder : base);
    }

    require(id) {
        return this._host.require(id);
    }

    exception(error, fatal) {
        this._host.exception(error, fatal);
    }
};

global.Document = class {

    constructor() {
        this._elements = {};
        this.documentElement = new HTMLElement();
        this.body = new HTMLElement();
    }

    createElement(/* name */) {
        return new HTMLElement();
    }

    createElementNS(/* namespace, name */) {
        return new HTMLElement();
    }

    createTextNode(/* text */) {
        return new HTMLElement();
    }

    getElementById(id) {
        let element = this._elements[id];
        if (!element) {
            element = new HTMLElement();
            this._elements[id] = element;
        }
        return element;
    }

    addEventListener(/* event, callback */) {
    }

    removeEventListener(/* event, callback */) {
    }
};

global.HTMLElement = class {

    constructor() {
        this._childNodes = [];
        this._attributes = new Map();
        this._style = new CSSStyleDeclaration();
    }

    get style() {
        return this._style;

    }

    appendChild(node) {
        this._childNodes.push(node);
    }

    setAttribute(name, value) {
        this._attributes.set(name, value);
    }

    hasAttribute(name) {
        return this._attributes.has(name);
    }

    getAttribute(name) {
        return this._attributes.get(name);
    }

    getElementsByClassName(name) {
        const elements = [];
        for (const node of this._childNodes) {
            if (node instanceof HTMLElement) {
                elements.push(...node.getElementsByClassName(name));
                if (node.hasAttribute('class') &&
                    node.getAttribute('class').split(' ').find((text) => text === name)) {
                    elements.push(node);
                }
            }
        }
        return elements;
    }

    addEventListener(/* event, callback */) {
    }

    removeEventListener(/* event, callback */) {
    }

    get classList() {
        return new DOMTokenList();
    }

    getBBox() {
        return { x: 0, y: 0, width: 10, height: 10 };
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, wigth: 0, height: 0 };
    }

    scrollTo() {
    }

    focus() {
    }
};

global.CSSStyleDeclaration = class {

    constructor() {
        this._properties = new Map();
    }

    setProperty(name, value) {
        this._properties.set(name, value);
    }
};

global.DOMTokenList = class {

    add(/* token */) {
    }
};

global.Window = class {

    constructor() {
        this._document = new Document();
    }

    get document() {
        return this._document;
    }

    addEventListener(/* event, callback */) {
    }

    removeEventListener(/* event, callback */) {
    }
};

const clearLine = () => {
    if (process.stdout.clearLine) {
        process.stdout.clearLine();
    }
};

const write = (message) => {
    if (process.stdout.write) {
        process.stdout.write(message);
    }
};

const decompress = (buffer) => {
    let archive = zip.Archive.open(buffer, 'gzip');
    if (archive && archive.entries.size == 1) {
        const stream = archive.entries.values().next().value;
        buffer = stream.peek();
    }
    const formats = [ zip, tar ];
    for (const module of formats) {
        archive = module.Archive.open(buffer);
        if (archive) {
            break;
        }
    }
    return archive;
};

const request = async (url, init) => {
    const response = await fetch(url, init);
    if (!response.ok) {
        throw new Error(response.status.toString());
    }
    if (response.body) {
        const reader = response.body.getReader();
        const length = response.headers.has('Content-Length') ? Number(response.headers.get('Content-Length')) : -1;
        let position = 0;
        const stream = new ReadableStream({
            start(controller) {
                const read = async () => {
                    try {
                        const result = await reader.read();
                        if (result.done) {
                            clearLine();
                            controller.close();
                        } else {
                            position += result.value.length;
                            if (length >= 0) {
                                const label = url.length > 70 ? url.substring(0, 66) + '...' : url;
                                write('  (' + ('  ' + Math.floor(100 * (position / length))).slice(-3) + '%) ' + label + '\r');
                            } else {
                                write('  ' + position + ' bytes\r');
                            }
                            controller.enqueue(result.value);
                            read();
                        }
                    } catch (error) {
                        controller.error(error);
                    }
                };
                read();
            }
        });
        return new Response(stream, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }
    return response;
};

class Target {

    constructor(host, item) {
        Object.assign(this, item);
        this.host = host;
        this.target = item.target.split(',');
        this.action = new Set((this.action || '').split(';'));
        this.folder = path.normalize(path.join(__dirname, '..', 'third_party' , 'test', item.type));
    }

    match(patterns) {
        if (patterns.length === 0) {
            return true;
        }
        for (const pattern of patterns) {
            for (const target of this.target) {
                const name = this.type + '/' + target;
                const match = pattern.indexOf('*') !== -1 ?
                    new RegExp('^' + pattern.replace('*', '.*') + '$').test(name) :
                    name.startsWith(pattern);
                if (match) {
                    return true;
                }
            }
        }
        return false;
    }

    async execute() {
        write(this.type + '/' + this.target[0] + '\n');
        clearLine();
        await this.download(Array.from(this.target), this.source);
        try {
            await this.load();
            this.validate();
            if (!this.action.has('skip-render')) {
                await this.render();
            }
            if (this.error) {
                throw new Error('Expected error.');
            }
        } catch (error) {
            if (!this.error || error.message !== this.error) {
                throw error;
            }
        }
    }

    async download(targets, sources) {
        if (targets.every((file) => fs.existsSync(this.folder + '/' + file))) {
            return;
        }
        if (!sources) {
            throw new Error('Download source not specified.');
        }
        let source = '';
        let sourceFiles = [];
        const match = sources.match(/^(.*?)\[(.*?)\](.*)$/);
        if (match) {
            source = match[1];
            sourceFiles = match[2].split(',').map((file) => file.trim());
            sources = match[3] && match[3].startsWith(',') ? match[3].substring(1).trim() : '';
        } else {
            const commaIndex = sources.indexOf(',');
            if (commaIndex != -1) {
                source = sources.substring(0, commaIndex);
                sources = sources.substring(commaIndex + 1);
            } else {
                source = sources;
                sources = '';
            }
        }
        for (const target of targets) {
            const dir = path.dirname(this.folder + '/' + target);
            fs.mkdirSync(dir, { recursive: true });
        }
        const response = await request(source);
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);
        if (sourceFiles.length > 0) {
            clearLine();
            write('  decompress...\r');
            const archive = decompress(data);
            clearLine();
            for (const name of sourceFiles) {
                write('  write ' + name + '\r');
                if (name !== '.') {
                    const stream = archive.entries.get(name);
                    if (!stream) {
                        throw new Error("Entry not found '" + name + '. Archive contains entries: ' + JSON.stringify(Array.from(archive.entries.keys())) + " .");
                    }
                    const target = targets.shift();
                    const buffer = stream.peek();
                    const file = path.join(this.folder, target);
                    fs.writeFileSync(file, buffer, null);
                } else {
                    const target = targets.shift();
                    const dir = path.join(this.folder, target);
                    fs.mkdirSync(dir, { recursive: true });
                }
                clearLine();
            }
        } else {
            const target = targets.shift();
            clearLine();
            write('  write ' + target + '\r');
            fs.writeFileSync(this.folder + '/' + target, data, null);
        }
        clearLine();
        if (sources.length > 0) {
            await this.download(targets, sources);
        }
    }

    async load() {
        const target = path.join(this.folder, this.target[0]);
        const identifier = path.basename(target);
        const stat = fs.statSync(target);
        let context = null;
        if (stat.isFile()) {
            const buffer = fs.readFileSync(target, null);
            const reader = new base.BinaryStream(buffer);
            const dirname = path.dirname(target);
            context = new host.TestHost.Context(this.host, dirname, identifier, reader);
        } else if (stat.isDirectory()) {
            const entries = new Map();
            const walk = (dir) => {
                for (const item of fs.readdirSync(dir)) {
                    const pathname = path.join(dir, item);
                    const stat = fs.statSync(pathname);
                    if (stat.isDirectory()) {
                        walk(pathname);
                    } else if (stat.isFile()) {
                        const buffer = fs.readFileSync(pathname, null);
                        const stream = new base.BinaryStream(buffer);
                        const name = pathname.split(path.sep).join(path.posix.sep);
                        entries.set(name, stream);
                    }
                }
            };
            walk(target);
            context = new host.TestHost.Context(this.host, target, identifier, null, entries);
        }
        const modelFactoryService = new view.ModelFactoryService(this.host);
        this.model = await modelFactoryService.open(context);
    }

    validate() {
        if (!this.model.format || (this.format && this.format != this.model.format)) {
            throw new Error("Invalid model format '" + this.model.format + "'.");
        }
        if (this.producer && this.model.producer != this.producer) {
            throw new Error("Invalid producer '" + this.model.producer + "'.");
        }
        if (this.runtime && this.model.runtime != this.runtime) {
            throw new Error("Invalid runtime '" + this.model.runtime + "'.");
        }
        if (this.assert) {
            for (const assert of this.assert) {
                const parts = assert.split('=').map((item) => item.trim());
                const properties = parts[0].split('.');
                const value = parts[1];
                let context = { model: this.model };
                while (properties.length) {
                    const property = properties.shift();
                    if (context[property] !== undefined) {
                        context = context[property];
                        continue;
                    }
                    const match = /(.*)\[(.*)\]/.exec(property);
                    if (match.length === 3 && context[match[1]] !== undefined) {
                        const array = context[match[1]];
                        const index = parseInt(match[2], 10);
                        if (array[index] !== undefined) {
                            context = array[index];
                            continue;
                        }
                    }
                    throw new Error("Invalid property path: '" + parts[0]);
                }
                if (context !== value.toString()) {
                    throw new Error("Invalid '" + value.toString() + "' != '" + assert + "'.");
                }
            }
        }
        if (this.model.version || this.model.description || this.model.author || this.model.license) {
            // continue
        }
        for (const graph of this.model.graphs) {
            for (const input of graph.inputs) {
                input.name.toString();
                input.name.length;
                for (const argument of input.arguments) {
                    argument.name.toString();
                    argument.name.length;
                    if (argument.type) {
                        argument.type.toString();
                    }
                    if (argument.quantization || argument.initializer) {
                        // continue
                    }
                }
            }
            for (const output of graph.outputs) {
                output.name.toString();
                output.name.length;
                for (const argument of output.arguments) {
                    argument.name.toString();
                    argument.name.length;
                    if (argument.type) {
                        argument.type.toString();
                    }
                }
            }
            for (const node of graph.nodes) {
                const type = node.type;
                if (!type || typeof type.name != 'string') {
                    throw new Error("Invalid node type '" + JSON.stringify(node.type) + "'.");
                }
                view.Documentation.format(type);
                node.name.toString();
                node.description;
                node.attributes.slice();
                for (const attribute of node.attributes) {
                    attribute.name.toString();
                    attribute.name.length;
                    let value = new view.Formatter(attribute.value, attribute.type).toString();
                    if (value && value.length > 1000) {
                        value = value.substring(0, 1000) + '...';
                    }
                    /* value = */ value.split('<');
                }
                for (const input of node.inputs) {
                    input.name.toString();
                    input.name.length;
                    for (const argument of input.arguments) {
                        argument.name.toString();
                        argument.name.length;
                        argument.description;
                        if (argument.type) {
                            argument.type.toString();
                        }
                        if (argument.initializer) {
                            argument.initializer.type.toString();
                            const tensor = new view.Tensor(argument.initializer);
                            if (tensor.layout !== '<' && tensor.layout !== '>' && tensor.layout !== '|' && tensor.layout !== 'sparse' && tensor.layout !== 'sparse.coo') {
                                throw new Error("Tensor layout '" + tensor.layout + "' is not implemented.");
                            }
                            if (!tensor.empty) {
                                if (tensor.type && tensor.type.dataType === '?') {
                                    throw new Error('Tensor data type is not defined.');
                                } else if (tensor.type && !tensor.type.shape) {
                                    throw new Error('Tensor shape is not defined.');
                                } else {
                                    tensor.toString();
                                    /*
                                    const python = require('../source/python');
                                    const tensor = argument.initializer;
                                    if (tensor.type && tensor.type.dataType !== '?') {
                                        let data_type = tensor.type.dataType;
                                        switch (data_type) {
                                            case 'boolean': data_type = 'bool'; break;
                                        }
                                        const execution = new python.Execution();
                                        const bytes = execution.invoke('io.BytesIO', []);
                                        const dtype = execution.invoke('numpy.dtype', [ data_type ]);
                                        const array = execution.invoke('numpy.asarray', [ tensor.value, dtype ]);
                                        execution.invoke('numpy.save', [ bytes, array ]);
                                    }
                                    */
                                }
                            }
                        }
                    }
                }
                for (const output of node.outputs) {
                    output.name.toString();
                    output.name.length;
                    for (const argument of output.arguments) {
                        argument.name.toString();
                        argument.name.length;
                        if (argument.type) {
                            argument.type.toString();
                        }
                    }
                }
                if (node.chain) {
                    for (const chain of node.chain) {
                        chain.name.toString();
                        chain.name.length;
                    }
                }
                // new dialog.NodeSidebar(host, node);
            }
        }
    }

    async render() {
        const current = new view.View(this.host);
        current.options.attributes = true;
        current.options.initializers = true;
        await current.renderGraph(this.model, this.model.graphs[0]);
    }
}

const next = async () => {
    if (targets.length > 0) {
        const item = targets.pop();
        const target = new Target(global.window.__host__, item);
        if (target.match(patterns)) {
            await target.execute();
        }
        next();
    }
};

global.window = new Window();
global.window.__host__ = new host.TestHost();

next().catch((error) => {
    /* eslint-disable no-console */
    console.error(error.name + ': ' + error.message);
    if (error.cause) {
        console.error('  ' + error.cause.name + ': ' + error.cause.message);
    }
    /* eslint-enable no-console */
});