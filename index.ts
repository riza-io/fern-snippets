import Riza from '@riza-io/api';

const riza = new Riza({});

const API_KEY_MAP = {
    "elevenlabs":{name: "ELEVENLABS_API_KEY", value: process.env.ELEVENLABS_API_KEY},
    "cohere":{name: "COHERE_API_KEY", value: process.env.COHERE_API_KEY},
}

const EXTENSION_MAP = {
    "python": "python",
    "typescript": "typescript",
}

const RUNTIME_REVISION_ID_MAP = {
    "typescript": process.env.RIZA_RUNTIME_REVISION_ID_TYPESCRIPT,
    "python": process.env.RIZA_RUNTIME_REVISION_ID_PYTHON,
}

export const parseContent = (content: string, language: 'typescript' | 'python'): string[] => {
    const lines = content.split('\n');
    const codeBlocks: string[] = [];
    
    let inCodeBlock = false;
    let currentBlock: string[] = [];
    
    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        if (trimmedLine === `\`\`\`${EXTENSION_MAP[language]}`) {
            inCodeBlock = true;
            return;
        }
        
        if (trimmedLine === "```" && inCodeBlock) {
            inCodeBlock = false;
            codeBlocks.push(currentBlock.join('\n'));
            currentBlock = [];
            return;
        }
        
        if (inCodeBlock) {
            currentBlock.push(line);
        }
    });
    
    if (inCodeBlock) {
        console.warn(`Warning: Found unclosed ${language} code block`);
    }
    
    return codeBlocks;
};

export const parseFile = async (filePath: string, language: 'typescript' | 'python'): Promise<string[]> => {
    try {
        const file = Bun.file(filePath);
        const content = await file.text();
        return parseContent(content, language);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
};

const provider = process.argv[2] as keyof typeof API_KEY_MAP;

if (!provider) {
    console.error("Please provide a provider name as the first argument");
    process.exit(1);
}

const language = (process.argv[3] || 'typescript') as 'typescript' | 'python';
if (!language) {
    console.error("Please provide a language as the second argument");
    process.exit(1);
}

const runtimeRevisionId = RUNTIME_REVISION_ID_MAP[language];
if (!runtimeRevisionId) {
    console.error(`Runtime revision ID not found for ${language}`);
    process.exit(1);
}

const apiKey = API_KEY_MAP[provider].value;
if (!apiKey) {
    console.error(`API key not found for ${provider}`);
    process.exit(1);
}

const snippets = await parseFile(`${provider}.txt`, language);
let snippetsSkipped = 0
let successFullSnippets = 0
let failedSnippets = 0

for (let snippet of snippets) {
    if (snippet.includes("YOUR_API_KEY")) {
        snippet = snippet.replace("YOUR_API_KEY", apiKey);
    } else if (snippet.includes("<<apiKey>>")) {
        snippet = snippet.replace("<<apiKey>>", apiKey);
    } else if (snippet.includes("YOUR_TOKEN")) {
        snippet = snippet.replace("YOUR_TOKEN", apiKey);
    } else if (snippet.includes("<YOUR API KEY>")) {
        snippet = snippet.replace("<YOUR API KEY>", apiKey);
    } else if (snippet.includes("<apiKey>")) {
        snippet = snippet.replace("<apiKey>", apiKey);
    }

    console.log(snippet);

    let resp;
    try {
        resp = await riza.command.exec({
            language,

        code: snippet,
        runtime_revision_id: runtimeRevisionId,
        env: {
            [API_KEY_MAP[provider].name]: apiKey,
        },
        http: {
            allow: [{
              host: "*",
            }]
          },
    });

    if (resp.stderr?.length === 0) {
        successFullSnippets += 1;
    } else {
        failedSnippets += 1;
    }
    console.log(resp.stdout);
    console.error(resp.stderr);
    } catch (error) {
        console.error("Error executing snippet");
        console.error(error);
        failedSnippets += 1;
    }


    console.log(`${snippetsSkipped} snippets skipped`);
    console.log(`${successFullSnippets} snippets succeeded`);
    console.log(`${failedSnippets} snippets failed`);
    await Bun.sleep(1000);
}
