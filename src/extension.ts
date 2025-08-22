import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

let extensionContext: vscode.ExtensionContext;

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
    // Get workspace root path
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let relativePath = '';

    if (workspaceRoot && uri) {
        relativePath = path.relative(workspaceRoot, uri.fsPath);
        console.log('Relative path calculated:', relativePath);
    }

    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
        'fileContextSidebar',
        'File Context - ' + path.basename(uri.fsPath),
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Set the HTML content from file
    panel.webview.html = getWebviewContent(relativePath, context);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async (data) => {
            switch (data.type) {
                case 'generate':
                    handleGenerate(data.payload);
                    break;
            }
        },
        undefined,
        []
    );
}

function getWebviewContent(relativePath: string, context: vscode.ExtensionContext): string {
    try {
        // Read HTML template file
        const htmlPath = path.join(context.extensionPath, 'src', 'sidebar.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Escape the relative path
        const escapedPath = relativePath.replace(/\\/g, '/').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        
        // Replace placeholder with actual file path
        htmlContent = htmlContent.replace('{{filePath}}', escapedPath);
        
        return htmlContent;
    } catch (error) {
        console.error('Error reading HTML file:', error);
        return `<html><body><h3>Error loading sidebar content</h3></body></html>`;
    }
}

async function handleGenerate(payload: any) {
    console.log('Generate button clicked with data:', payload);
    
    try {
        // Using httpbin for testing - replace with your actual API
        const apiUrl = 'https://httpbin.org/post';
        
        console.log('Sending POST request to:', apiUrl);
        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        console.log('POST request successful:', response.status);
        vscode.window.showInformationMessage('Data sent successfully!');
        
    } catch (error: any) {
        console.error('POST request failed:', error.message);
        vscode.window.showErrorMessage(`Failed to send data: ${error.message}`);
    }
}

export function deactivate() {
    console.log('File Context Sidebar extension deactivated');
}