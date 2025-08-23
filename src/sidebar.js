(function() {
    const vscode = acquireVsCodeApi();
    let currentResponse = null;
    let endpoints = [];

    function switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName + 'Tab').classList.add('active');
        document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`).classList.add('active');
        
        if (tabName === 'config') {
            renderEndpointsList();
        }
    }

    function generate() {
        const filePath = document.getElementById('filePath').value;
        const endpoint = document.getElementById('endpoint').value;
        const gitlabProjectId = document.getElementById('gitlabProjectId').value;
        const allureId = document.getElementById('allureId').value;
        const testScenario = document.getElementById('testScenario').value;

        const payload = {
            endpoint: endpoint,
            data: {
                filePath: filePath,
                gitlabProjectId: gitlabProjectId,
                allureId: allureId,
                testScenario: testScenario
            }
        };

        document.getElementById('requestStatus').innerHTML = 
            '<div class="success">Sending request...</div>';
        
        vscode.postMessage({
            type: 'generate',
            payload: payload
        });
    }

    function createEditor() {
        if (currentResponse) {
            vscode.postMessage({
                type: 'createEditor'
            });
        } else {
            document.getElementById('responseStatus').innerHTML = 
                '<div class="error">No response data available</div>';
        }
    }

    function renderEndpointsList() {
        const container = document.getElementById('endpointsList');
        container.innerHTML = '';
        
        endpoints.forEach(endpoint => {
            const item = document.createElement('div');
            item.className = 'endpoint-item';
            item.innerHTML = `
                <span>${endpoint}</span>
                <span class="remove-endpoint" onclick="removeEndpoint('${endpoint.replace(/'/g, "\\'")}')">✕</span>
            `;
            container.appendChild(item);
        });
    }

    function addNewEndpoint() {
        const newEndpoint = document.getElementById('newEndpoint').value.trim();
        if (newEndpoint) {
            vscode.postMessage({
                type: 'addEndpoint',
                payload: newEndpoint
            });
            document.getElementById('newEndpoint').value = '';
        }
    }

    function removeEndpoint(endpoint) {
        vscode.postMessage({
            type: 'removeEndpoint',
            payload: endpoint
        });
    }

    function resetToDefaults() {
        vscode.postMessage({
            type: 'resetEndpoints'
        });
    }

    function updateEndpointDropdown() {
        const dropdown = document.getElementById('endpoint');
        dropdown.innerHTML = endpoints.map(endpoint => 
            `<option value="${endpoint}">${endpoint}</option>`
        ).join('');
    }

    function initializeEndpoints(endpointsData) {
        endpoints = endpointsData;
        updateEndpointDropdown();
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'response':
                currentResponse = message.payload;
                
                // Update response tab
                document.getElementById('responseStatus').value = 
                    message.payload.status + (message.payload.error ? ' (Error)' : ' (Success)');
                
                let responseText;
                if (message.payload.error) {
                    responseText = `Error: ${message.payload.error}\n\n`;
                    if (message.payload.data) {
                        responseText += JSON.stringify(message.payload.data, null, 2);
                    }
                } else {
                    responseText = JSON.stringify(message.payload.data, null, 2);
                }
                
                document.getElementById('responseData').textContent = responseText;
                
                // Update request status
                if (message.payload.error) {
                    document.getElementById('requestStatus').innerHTML = 
                        `<div class="error">Error: ${message.payload.error}</div>`;
                } else {
                    document.getElementById('requestStatus').innerHTML = 
                        `<div class="success">Request successful! Status: ${message.payload.status}</div>`;
                }
                
                // Switch to response tab
                switchTab('response');
                break;
            
            case 'endpointsUpdated':
                endpoints = message.payload;
                renderEndpointsList();
                updateEndpointDropdown();
                break;
            
            case 'initialize':
                initializeEndpoints(message.payload.endpoints);
                break;
        }
    });

    // Make functions available globally
    window.switchTab = switchTab;
    window.generate = generate;
    window.createEditor = createEditor;
    window.addNewEndpoint = addNewEndpoint;
    window.removeEndpoint = removeEndpoint;
    window.resetToDefaults = resetToDefaults;

    // Initialize on load
    vscode.postMessage({
        type: 'ready'
    });
})();