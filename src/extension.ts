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

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    
    let disposable = vscode.commands.registerCommand('myExtension.doSomethingWithFile', (resource: vscode.Uri) => {
        vscode.window.showInformationMessage(`You right-clicked on: ${resource.fsPath}`);
        openSidebar(resource, context);
    });

    const openSidebarCommand = vscode.commands.registerCommand('myExtension.openSidebar', (uri: vscode.Uri) => {
        console.log('Context menu clicked on file:', uri.fsPath);
        openSidebar(uri, context);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(openSidebarCommand);
}

function openSidebar(uri: vscode.Uri, context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let relativePath = '';

    if (workspaceRoot && uri) {
        relativePath = path.relative(workspaceRoot, uri.fsPath);
        console.log('Relative path calculated:', relativePath);
    }

    // Get configured endpoints
    const config = vscode.workspace.getConfiguration('fileContextSidebar');
    const endpoints = config.get<string[]>('apiEndpoints') || ['https://httpbin.org/post'];

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

    panel.webview.html = getWebviewContent(relativePath, endpoints, context);

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
            }
        },
        undefined,
        context.subscriptions
    );
}

function getWebviewContent(relativePath: string, endpoints: string[], context: vscode.ExtensionContext): string {
    try {
        const htmlPath = path.join(context.extensionPath, 'src', 'sidebar.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        const escapedPath = relativePath.replace(/\\/g, '/').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        // Create endpoint options HTML
        const endpointOptions = endpoints.map(endpoint => 
            `<option value="${endpoint}">${endpoint}</option>`
        ).join('');

        // Replace placeholders
        htmlContent = htmlContent
            .replace('{{filePath}}', escapedPath)
            .replace('{{endpointOptions}}', endpointOptions);
        
        return htmlContent;
    } catch (error) {
        console.error('Error reading HTML file:', error);
        return `<html><body><h3>Error loading sidebar content</h3></body></html>`;
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

        // Send response back to webview
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
    // Create formatted response content
    const content = JSON.stringify(response.data, null, 2);
    
    // Create new text document
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