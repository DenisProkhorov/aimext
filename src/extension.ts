import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let extensionContext: vscode.ExtensionContext;

interface ApiResponse {
    status: number;
    data: any;
    error?: string;
}

const DEFAULT_ENDPOINTS = [
    'https://httpbin.org/post',
    'https://jsonplaceholder.typicode.com/posts',
    'http://localhost:3000/api'
];

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    
    initializeSettings();
    
    let disposable = vscode.commands.registerCommand('myExtension.doSomethingWithFile', (resource: vscode.Uri) => {
        vscode.window.showInformationMessage(`You right-clicked on: ${resource.fsPath}`);
        openSidebar(resource, context);
    });

    const openSidebarCommand = vscode.commands.registerCommand('myExtension.openSidebar', (uri: vscode.Uri) => {
        console.log('Context menu clicked on file:', uri.fsPath);
        openSidebar(uri, context);
    });

    const resetEndpointsCommand = vscode.commands.registerCommand('myExtension.resetEndpoints', () => {
        resetEndpointsToDefault();
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(openSidebarCommand);
    context.subscriptions.push(resetEndpointsCommand);
}

async function initializeSettings() {
    try {
        const config = vscode.workspace.getConfiguration('fileContextSidebar');
        const currentEndpoints = config.get<string[]>('apiEndpoints');

        if (!currentEndpoints || currentEndpoints.length === 0) {
            await config.update('apiEndpoints', DEFAULT_ENDPOINTS, vscode.ConfigurationTarget.Global);
            console.log('Default endpoints configured');
        }
    } catch (error) {
        console.error('Failed to initialize settings:', error);
    }
}

async function resetEndpointsToDefault() {
    try {
        const config = vscode.workspace.getConfiguration('fileContextSidebar');
        await config.update('apiEndpoints', DEFAULT_ENDPOINTS, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Endpoints reset to default values');
    } catch (error) {
        console.error('Failed to reset endpoints:', error);
        vscode.window.showErrorMessage('Failed to reset endpoints');
    }
}

function openSidebar(uri: vscode.Uri, context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let relativePath = '';

    if (workspaceRoot && uri) {
        relativePath = path.relative(workspaceRoot, uri.fsPath);
        console.log('Relative path calculated:', relativePath);
    }

    const config = vscode.workspace.getConfiguration('fileContextSidebar');
    const endpoints = config.get<string[]>('apiEndpoints') || DEFAULT_ENDPOINTS;

    const panel = vscode.window.createWebviewPanel(
        'fileContextSidebar',
        'File Context - ' + path.basename(uri.fsPath),
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src'))]
        }
    );

    // Get the URI for the JavaScript file
    const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'src', 'sidebar.js'));
    const scriptUri = panel.webview.asWebviewUri(scriptPath);

    panel.webview.html = getWebviewContent(relativePath, endpoints, scriptUri, context);

    let lastResponse: ApiResponse | null = null;

    panel.webview.onDidReceiveMessage(
        async (data) => {
            switch (data.type) {
                case 'generate':
                    lastResponse = await handleGenerate(data.payload, panel);
                    break;
                case 'createEditor':
                    if (lastResponse) {
                        createEditorWithResponse(lastResponse);
                    } else {
                        vscode.window.showWarningMessage('No response data available to create editor');
                    }
                    break;
                case 'addEndpoint':
                    await addEndpoint(data.payload, panel);
                    break;
                case 'removeEndpoint':
                    await removeEndpoint(data.payload, panel);
                    break;
                case 'resetEndpoints':
                    await resetEndpointsToDefault();
                    break;
                case 'ready':
                    // Send initial data to webview
                    panel.webview.postMessage({
                        type: 'initialize',
                        payload: { endpoints }
                    });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getWebviewContent(relativePath: string, endpoints: string[], scriptUri: vscode.Uri, context: vscode.ExtensionContext): string {
    try {
        const htmlPath = path.join(context.extensionPath, 'src', 'sidebar.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        const escapedPath = relativePath.replace(/\\/g, '/').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        const endpointOptions = endpoints.map(endpoint => 
            `<option value="${endpoint}">${endpoint}</option>`
        ).join('');

        // Replace placeholders and add script tag
        htmlContent = htmlContent
            .replace('{{filePath}}', escapedPath)
            .replace('{{endpointOptions}}', endpointOptions)
            .replace('{{scriptUri}}', scriptUri.toString());
        
        return htmlContent;
    } catch (error) {
        console.error('Error reading HTML file:', error);
        return `<html><body><h3>Error loading sidebar content</h3></body></html>`;
    }
}

async function addEndpoint(endpoint: string, panel: vscode.WebviewPanel) {
    try {
        const config = vscode.workspace.getConfiguration('fileContextSidebar');
        const currentEndpoints = config.get<string[]>('apiEndpoints') || [];
        
        if (!currentEndpoints.includes(endpoint)) {
            const newEndpoints = [...currentEndpoints, endpoint];
            await config.update('apiEndpoints', newEndpoints, vscode.ConfigurationTarget.Global);
            
            // Send updated endpoints to webview
            panel.webview.postMessage({
                type: 'endpointsUpdated',
                payload: newEndpoints
            });
            
            vscode.window.showInformationMessage(`Endpoint added: ${endpoint}`);
            return true;
        } else {
            vscode.window.showWarningMessage('Endpoint already exists');
            return false;
        }
    } catch (error) {
        console.error('Failed to add endpoint:', error);
        vscode.window.showErrorMessage('Failed to add endpoint');
        return false;
    }
}

async function removeEndpoint(endpoint: string, panel: vscode.WebviewPanel) {
    try {
        const config = vscode.workspace.getConfiguration('fileContextSidebar');
        const currentEndpoints = config.get<string[]>('apiEndpoints') || [];
        
        const newEndpoints = currentEndpoints.filter(e => e !== endpoint);
        await config.update('apiEndpoints', newEndpoints, vscode.ConfigurationTarget.Global);
        
        // Send updated endpoints to webview
        panel.webview.postMessage({
            type: 'endpointsUpdated',
            payload: newEndpoints
        });
        
        vscode.window.showInformationMessage(`Endpoint removed: ${endpoint}`);
        return true;
    } catch (error) {
        console.error('Failed to remove endpoint:', error);
        vscode.window.showErrorMessage('Failed to remove endpoint');
        return false;
    }
}

async function handleGenerate(payload: any, panel: vscode.WebviewPanel): Promise<ApiResponse> {
    console.log('Generate button clicked with data:', payload);
    
    try {
        const response = await axios.post(payload.endpoint, payload.data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const apiResponse: ApiResponse = {
            status: response.status,
            data: response.data
        };

        panel.webview.postMessage({
            type: 'response',
            payload: apiResponse
        });

        vscode.window.showInformationMessage(`Request successful! Status: ${response.status}`);
        return apiResponse;
        
    } catch (error: any) {
        console.error('POST request failed:', error.message);
        
        const errorResponse: ApiResponse = {
            status: error.response?.status || 0,
            data: error.response?.data || null,
            error: error.message
        };

        panel.webview.postMessage({
            type: 'response',
            payload: errorResponse
        });

        vscode.window.showErrorMessage(`Request failed: ${error.message}`);
        return errorResponse;
    }
}

function createEditorWithResponse(response: ApiResponse) {
    const content = JSON.stringify(response.data, null, 2);
    
    vscode.workspace.openTextDocument({
        content: content,
        language: 'json'
    }).then(document => {
        vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    });
}

export function deactivate() {
    console.log('File Context Sidebar extension deactivated');
}