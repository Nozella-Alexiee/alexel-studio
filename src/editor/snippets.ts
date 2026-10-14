// Snippet per bahasa. Dipasang lewat languageData sehingga TIDAK menggantikan
// completion bawaan bahasa (versi lama memakai `override` dan mematikannya).

import { completeFromList, snippetCompletion, type Completion } from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";

const JS_TS_SNIPPETS: Completion[] = [
  // React Snippets
  snippetCompletion("useState<${1:any}>(${2:initial})", {
    label: "useState",
    type: "function",
    detail: "React State Hook",
    info: "Declares a state variable and setter function",
  }),
  snippetCompletion("useEffect(() => {\n\t${1}\n\treturn () => {\n\t\t${2}\n\t};\n}, [${3}]);", {
    label: "useEffect",
    type: "function",
    detail: "React Effect Hook",
    info: "Side effect hook with cleanup function",
  }),
  snippetCompletion("useCallback((${1:args}) => {\n\t${2}\n}, [${3}]);", {
    label: "useCallback",
    type: "function",
    detail: "React Callback Hook",
  }),
  snippetCompletion("useMemo(() => {\n\treturn ${1};\n}, [${2}]);", {
    label: "useMemo",
    type: "function",
    detail: "React Memo Hook",
  }),
  snippetCompletion("useRef<${1:any}>(${2:null});", {
    label: "useRef",
    type: "function",
    detail: "React Ref Hook",
  }),
  snippetCompletion("export const ${1:ComponentName}: React.FC<${2:Props}> = ({ ${3:props} }) => {\n\treturn (\n\t\t<div>\n\t\t\t${4}\n\t\t</div>\n\t);\n};", {
    label: "rfc",
    type: "snippet",
    detail: "React Functional Component",
  }),

  // JS/TS Keywords & Patterns
  snippetCompletion("import { ${1:items} } from '${2:module}';", {
    label: "imp",
    type: "keyword",
    detail: "ES6 Named Import",
  }),
  snippetCompletion("import ${1:defaultExport} from '${2:module}';", {
    label: "impd",
    type: "keyword",
    detail: "ES6 Default Import",
  }),
  snippetCompletion("console.log('${1:label}:', ${2:value});", {
    label: "clg",
    type: "function",
    detail: "Console Log statement",
  }),
  snippetCompletion("async function ${1:name}(${2:params}): Promise<${3:void}> {\n\t${4}\n}", {
    label: "afn",
    type: "function",
    detail: "Async Function declaration",
  }),
  snippetCompletion("try {\n\t${1}\n} catch (err) {\n\tconsole.error(err);\n}", {
    label: "trycatch",
    type: "keyword",
    detail: "Try/Catch block",
  }),
  snippetCompletion("interface ${1:Name} {\n\t${2:property}: ${3:string};\n}", {
    label: "interface",
    type: "type",
    detail: "TypeScript Interface",
  }),
  snippetCompletion("type ${1:Name} = ${2:string};", {
    label: "type",
    type: "type",
    detail: "TypeScript Type Alias",
  }),
];

const HTML_SNIPPETS: Completion[] = [
  snippetCompletion("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n\t<meta charset=\"UTF-8\" />\n\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2}\n</body>\n</html>", {
    label: "html5",
    type: "snippet",
    detail: "HTML5 Boilerplate Template",
  }),
  snippetCompletion("<div class=\"${1:class}\">\n\t${2}\n</div>", { label: "div", type: "snippet" }),
  snippetCompletion("<button type=\"button\" class=\"${1:btn}\">${2:Click}</button>", { label: "button", type: "snippet" }),
  snippetCompletion("<a href=\"${1:#}\" class=\"${2:link}\">${3:Link}</a>", { label: "a", type: "snippet" }),
  snippetCompletion("<img src=\"${1:image.png}\" alt=\"${2:description}\" />", { label: "img", type: "snippet" }),
  snippetCompletion("<section id=\"${1:section}\">\n\t${2}\n</section>", { label: "section", type: "snippet" }),
];

const CSS_SNIPPETS: Completion[] = [
  snippetCompletion("display: flex;\njustify-content: center;\nalign-items: center;", {
    label: "flex-center",
    type: "snippet",
    detail: "Flexbox Centering snippet",
  }),
  snippetCompletion("display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);\ngap: ${2:16px};", {
    label: "grid-layout",
    type: "snippet",
    detail: "CSS Grid columns",
  }),
  snippetCompletion("transition: all ${1:0.2s} ease;", { label: "trans", type: "property" }),
  snippetCompletion("backdrop-filter: blur(${1:20px});\n-webkit-backdrop-filter: blur(${1:20px});", {
    label: "glass",
    type: "snippet",
    detail: "Glassmorphism blur filter",
  }),
];

const PYTHON_SNIPPETS: Completion[] = [
  snippetCompletion("def ${1:func_name}(${2:args}):\n\t\"\"\"${3:Docstring}\"\"\"\n\t${4:pass}", {
    label: "def",
    type: "function",
    detail: "Python function definition",
  }),
  snippetCompletion("class ${1:ClassName}:\n\tdef __init__(self, ${2:args}):\n\t\tself.${3:prop} = ${4:val}", {
    label: "class",
    type: "class",
    detail: "Python Class constructor",
  }),
  snippetCompletion("if __name__ == '__main__':\n\t${1:main()}", {
    label: "main",
    type: "snippet",
    detail: "Python Main entrypoint guard",
  }),
];

const RUST_SNIPPETS: Completion[] = [
  snippetCompletion("fn ${1:name}(${2:args}) -> Result<${3:()}, ${4:String}> {\n\t${5:Ok(())}\n}", {
    label: "fnres",
    type: "function",
    detail: "Rust Function returning Result",
  }),
  snippetCompletion("#[derive(Serialize, Deserialize, Clone, Debug)]\npub struct ${1:Name} {\n\tpub ${2:field}: ${3:String},\n}", {
    label: "struct",
    type: "type",
    detail: "Rust Public Struct with Serde derives",
  }),
  snippetCompletion("match ${1:val} {\n\tOk(${2:res}) => ${3},\n\tErr(e) => ${4},\n}", {
    label: "matchok",
    type: "snippet",
    detail: "Rust Match Result pattern",
  }),
];

const PHP_SNIPPETS: Completion[] = [
  snippetCompletion("<?php\n\n${1}", {
    label: "<?php",
    type: "keyword",
    detail: "PHP Open Tag",
  }),
  snippetCompletion("declare(strict_types=1);\n\n${1}", {
    label: "strict",
    type: "keyword",
    detail: "Declare Strict Types",
  }),
  snippetCompletion("namespace ${1:App\\Services};\n\n${2}", {
    label: "ns",
    type: "keyword",
    detail: "PHP Namespace Statement",
  }),
  snippetCompletion("public function ${1:name}(${2}): ${3:void} {\n\t${4}\n}", {
    label: "pubf",
    type: "function",
    detail: "PHP Public Method",
  }),
  snippetCompletion("private function ${1:name}(${2}): ${3:void} {\n\t${4}\n}", {
    label: "prif",
    type: "function",
    detail: "PHP Private Method",
  }),
  snippetCompletion("class ${1:ClassName} {\n\tpublic function __construct(\n\t\t${2:private readonly string \\$name},\n\t) {}\n}", {
    label: "class",
    type: "class",
    detail: "PHP 8+ Class with Constructor Promotion",
  }),
  snippetCompletion("interface ${1:InterfaceName} {\n\tpublic function ${2:methodName}(${3}): ${4:void};\n}", {
    label: "interface",
    type: "class",
    detail: "PHP Interface Declaration",
  }),
  snippetCompletion("enum ${1:Status}: string {\n\tcase ${2:Active} = '${3:active}';\n\tcase ${4:Inactive} = '${5:inactive}';\n}", {
    label: "enum",
    type: "class",
    detail: "PHP 8.1 Backed Enum",
  }),
  snippetCompletion("private readonly ${1:string} \\$${2:name};", {
    label: "prop",
    type: "property",
    detail: "PHP 8.1 Readonly Property",
  }),
  snippetCompletion("fn(${1:\\$x}) => ${2:\\$x * 2}", {
    label: "fn",
    type: "function",
    detail: "PHP Arrow Function",
  }),
  snippetCompletion("try {\n\t${1}\n} catch (\\Throwable \\$e) {\n\t${2:error_log(\\$e->getMessage());}\n}", {
    label: "trycatch",
    type: "keyword",
    detail: "PHP Try/Catch block",
  }),
  snippetCompletion("foreach (\\$${1:items} as \\$${2:item}) {\n\t${3}\n}", {
    label: "foreach",
    type: "keyword",
    detail: "PHP Foreach Loop",
  }),
  snippetCompletion("match (\\$${1:status}) {\n\t${2:'active'} => ${3:true},\n\tdefault => ${4:false},\n};", {
    label: "match",
    type: "keyword",
    detail: "PHP 8 Match Expression",
  }),
  snippetCompletion("echo \"${1:Hello World}\";", {
    label: "echo",
    type: "function",
    detail: "PHP Echo Statement",
  }),
  snippetCompletion("var_dump(\\$${1:var});", {
    label: "dump",
    type: "function",
    detail: "PHP var_dump debug helper",
  }),
];

const BY_LANG: Record<string, Completion[]> = {
  js: JS_TS_SNIPPETS,
  ts: JS_TS_SNIPPETS,
  html: HTML_SNIPPETS,
  css: CSS_SNIPPETS,
  py: PYTHON_SNIPPETS,
  rs: RUST_SNIPPETS,
  php: PHP_SNIPPETS,
};

export function snippetsFor(langId: string): Completion[] {
  return BY_LANG[langId] ?? [];
}

export function snippetExtension(langId: string): Extension {
  const list = snippetsFor(langId);
  if (!list.length) return [];
  const source = completeFromList(list);
  return EditorState.languageData.of(() => [{ autocomplete: source }]);
}
