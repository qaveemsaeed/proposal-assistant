/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// --- DOM Elements ---
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const descriptionInput = document.getElementById('project-description') as HTMLTextAreaElement;
const resultsContainer = document.getElementById('results') as HTMLElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;

// --- State ---
let isLoading = false;

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- Event Listeners ---
generateBtn.addEventListener('click', handleGenerateClick);


// --- Functions ---

/**
 * Step 1: Clean the raw project description to get core requirements.
 */
async function cleanDescription(projectDescription: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Please clean and summarize the following Upwork project description. Focus on extracting only the core requirements, client needs, and technical details. Remove all filler text, greetings, and boilerplate language. The output should be a concise summary.

    Project Description:
    ---
    ${projectDescription}
    ---
    `,
        config: {
            temperature: 0.2,
        }
    });
    return response.text;
}

/**
 * Step 2: Use the cleaned description and Google Search to generate a detailed outline.
 */
async function getProposalOutline(cleanedDescription: string) {
    const systemInstruction = `You are an expert proposal writer and AI solutions architect with access to Google Search for the latest information. Your task is to analyze a cleaned project description and generate a structured proposal outline that is easy for a non-technical person to understand.
- Identify the client's core problems (pain points).
- Propose a single, coherent solution in a concise paragraph.
- Suggest a list of the most relevant and up-to-date technologies for the solution.
- You MUST respond ONLY with a single, valid JSON object. Do not add any text before or after the JSON object, or any markdown formatting like \`\`\`json.
- The JSON object must follow this exact structure:
{
  "painPoints": ["A list of the client's key pain points."],
  "proposedSolution": "A single paragraph summarizing the proposed AI-powered solution.",
  "recommendedTech": ["A list of specific technologies (e.g., LangChain, LlamaIndex, N8n, Make.com) to implement the solution."]
}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
            role: 'user',
            parts: [{ text: cleanedDescription }]
        }],
        config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
        }
    });

    return response;
}


async function handleGenerateClick() {
    if (isLoading) return;

    const projectDescription = descriptionInput.value.trim();
    if (!projectDescription) {
        displayError('Please paste a project description first.');
        return;
    }

    setLoading(true, 'Cleaning project description...');

    try {
        const cleanedDescription = await cleanDescription(projectDescription);
        setLoading(true, 'Researching latest AI solutions...');

        const response = await getProposalOutline(cleanedDescription);

        // Attempt to parse the JSON response from the model
        let resultJson;
        try {
            // The model might return the JSON string wrapped in markdown, so we clean it.
            const cleanedText = response.text.replace(/^```json\s*|```\s*$/g, '').trim();
            resultJson = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('JSON Parsing Error:', parseError, 'Raw text:', response.text);
            throw new Error('The AI returned an invalid format. Please try again.');
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        displayResults(resultJson, groundingChunks);

    } catch (error) {
        console.error('Error generating proposal outline:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        displayError(`An error occurred while generating the outline: ${errorMessage}`);
    } finally {
        setLoading(false);
    }
}


function setLoading(state: boolean, message: string = 'Analyzing description and crafting your outline...') {
    isLoading = state;
    generateBtn.disabled = state;
    loadingIndicator.classList.toggle('hidden', !state);

    const messageElement = loadingIndicator.querySelector('p');
    if (messageElement) {
        messageElement.textContent = message;
    }

    if (state) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.remove('error');
    }
}

function displayResults(data: any, groundingChunks: any[] | undefined) {
    const painPointsHtml = data.painPoints?.length > 0 ? `
    <div class="result-section">
      <h2>Client's Pain Points</h2>
      <ul>
        ${data.painPoints.map((point: string) => `<li>${escapeHtml(point)}</li>`).join('')}
      </ul>
    </div>` : '';

    const solutionHtml = data.proposedSolution ? `
    <div class="result-section">
        <h2>Proposed Solution</h2>
        <p>${escapeHtml(data.proposedSolution)}</p>
    </div>
    ` : '';

    const techHtml = data.recommendedTech?.length > 0 ? `
    <div class="result-section">
        <h2>Recommended Tech Stack</h2>
        <ul class="tech-stack">
            ${data.recommendedTech.map((tech: string) => `<li>${escapeHtml(tech)}</li>`).join('')}
        </ul>
    </div>
    ` : '';

    const sourcesHtml = groundingChunks?.length > 0 ? `
    <div class="result-section sources-section">
        <h2>Sources</h2>
        <p>This outline was generated using information from the following sources:</p>
        <ul>
            ${groundingChunks.map(chunk =>
        chunk.web ? `<li><a href="${chunk.web.uri}" target="_blank" rel="noopener noreferrer">${escapeHtml(chunk.web.title || chunk.web.uri)}</a></li>` : ''
    ).join('')}
        </ul>
    </div>
    ` : '';

    resultsContainer.innerHTML = `
        ${painPointsHtml}
        ${solutionHtml}
        ${techHtml}
        ${sourcesHtml}
    `;
}


function displayError(message: string) {
    resultsContainer.classList.add('error');
    resultsContainer.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}