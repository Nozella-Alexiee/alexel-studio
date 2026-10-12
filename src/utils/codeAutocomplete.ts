import {
  autocompletion,
  closeBrackets,
  completeFromList,
  snippetCompletion,
  Completion,
} from "@codemirror/autocomplete";
import { Extension } from "@codemirror/state";

/**
 * Rich IntelliSense Autocompletion & Code Preview Snippets
 * Provides:
 * - Smart React / TypeScript snippets
 * - HTML & CSS tags and properties
 * - Python and Rust constructs
 * - Document identifier word completion
 * - Automatic bracket, parenthesis, and quote closing
 */

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

export function createCodeAutocomplete(filename: string): Extension[] {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let langSnippets: Completion[] = [];

  if (["ts", "tsx", "js", "jsx"].includes(ext)) {
    langSnippets = JS_TS_SNIPPETS;
  } else if (["html", "htm"].includes(ext)) {
    langSnippets = HTML_SNIPPETS;
  } else if (["css", "scss", "less"].includes(ext)) {
    langSnippets = CSS_SNIPPETS;
  } else if (["py", "pyw"].includes(ext)) {
    langSnippets = PYTHON_SNIPPETS;
  } else if (["rs"].includes(ext)) {
    langSnippets = RUST_SNIPPETS;
  }

  const completionSource = completeFromList(langSnippets);

  return [
    closeBrackets(),
    autocompletion({
      activateOnTyping: true,
      maxRenderedOptions: 25,
      override: [completionSource],
    }),
  ];
}
