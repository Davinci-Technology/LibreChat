const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('~/config');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const { WebSocket } = require('ws');

class DavinciProjectFiles extends Tool {
  constructor(fields) {
    super();
    this.userId = fields.userId;

    this.name = 'davinci-project-files';
    this.url = 'http://www.davincitech.ca';
    this.schema = z.object({
      function: z
        .enum(['getProjects', 'getProjectTree', 'getProjectFile'])
        .describe('The function to run.'),
      project_name: z
        .string()
        .optional()
        .describe('The name of the project to retrieve the file/tree for.'),
      file_path: z.string().optional().describe('The path of the file you want to retrieve'),
    });
    this.description = 'Access files on a developers workstation';
    this.description_for_model = `
      // When a user has this plugin enabled it is because they are working on a software project with you and expect you to use this plugin to access files on their workstation.
      // When the user asks you to take a look at a file, you should use this plugin to access the file on their workstation without asking them to upload it, or asking permission.  The fact that this plugin is enabled is the permission.
      // If the user has not specified a project name you should use the getProjects function to get a list of projects on their workstation and decide which one to use based on the users previous messages.
      // If you are unsure how to find the file use the getProjectTree function to get the file structure of the project.
      // Once you have the file path you can use the getProjectFile function to get the contents of the file.
      // You should not ask the user for the file path, or ask them to upload the file.  You should use this plugin to access the file on their workstation.
      // If the user asks you to troubleshoot a problem or add a feature without specifying a particular file name do the following.
      // 1. Use the getProjects function to get a list of projects on their workstation if you have not already done so earlier in the conversation.
      // 2. Use the getProjectTree function to get the file structure of the project if you have not already done so earlier in the conversation.
      // 3. Analyze the project tree and determine the files that are most likely to be relevant to the problem or feature.
      // 4. Use the getProjectFile function to get the contents of the file.
      // 5. Use the contents of the file to troubleshoot the problem or add the feature, or request more files if you need them.
    `;

    this.ws = null;
    this.wsUrl = process.env.DAVINCI_WEBSOCKET_URL + `/${this.userId}/`;
    logger.error("Davinci wsUrl set to " + this.wsUrl);
    this.pending_requests = new Map();

    if (!fields.override) {
      this.connectWebSocket();
    }
  }

  connectWebSocket() {
    if (this.ws) {
      return;
    }

    try {
      logger.error('Creating WebSocket: ', this.wsUrl);
      this.ws = new WebSocket(this.wsUrl, {
        // Add some basic WebSocket options
        handshakeTimeout: 5000,
      });

      // Handle socket states
      this.ws.addEventListener('connecting', () => {
        logger.info('WebSocket connecting...');
      });

      this.ws.addEventListener('open', () => {
        // Send an initial message to verify connection
        this.ws.send(
          JSON.stringify({
            sender_type: 'plugin',
            type: 'connection_verify',
            request_id: 'initial-connection',
          }),
        );
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.request_id && this.pending_requests.has(response.request_id)) {
            const { resolve, reject } = this.pending_requests.get(response.request_id);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.data);
            }
            this.pending_requests.delete(response.request_id);
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      this.ws.addEventListener('close', (event) => {
        logger.error(`WebSocket closed with code ${event.code}: ${event.reason}`);
        this.ws = null;
        // Attempt to reconnect after a delay
        setTimeout(() => this.connectWebSocket(), 5000);
      });

      this.ws.addEventListener('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    } catch (error) {
      logger.error('Error creating WebSocket:', error);
      this.ws = null;
      // Attempt to reconnect after a delay
      setTimeout(() => this.connectWebSocket(), 5000);
    }
  }

  async sendWebSocketRequest(type, payload = {}) {

    return new Promise((resolve, reject) => {

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const request_id = Math.random().toString(36).substring(2, 15);

      const request = {
        request_id,
        sender_type: 'plugin',
        type,
        ...payload,
      };

      this.pending_requests.set(request_id, { resolve, reject });

      // Set a timeout to clean up pending requests
      setTimeout(() => {
        if (this.pending_requests.has(request_id)) {
          const { reject } = this.pending_requests.get(request_id);
          reject(new Error('Request timeout'));
          this.pending_requests.delete(request_id);
        }
      }, 30000); // 30 second timeout

      this.ws.send(JSON.stringify(request));
    });
  }

  async _getProjects() {
    try {
      const response = await this.sendWebSocketRequest('get_projects');
      return JSON.stringify(response);
    } catch (error) {
      logger.error('Error getting projects:', error);
      throw error;
    }
  }

  async _getProjectTree(projectName) {
    try {
      const response = await this.sendWebSocketRequest('get_project_tree', {
        project_name: projectName,
      });
      return JSON.stringify(response);
    } catch (error) {
      logger.error('Error getting project tree:', error);
      throw error;
    }
  }

  async _getProjectFile(projectName, filePath) {
    try {
      const response = await this.sendWebSocketRequest('get_file', {
        project_name: projectName,
        file_path: filePath,
      });
      return JSON.stringify(response);
    } catch (error) {
      logger.error('Error getting file contents:', error);
      throw error;
    }
  }

  async _call(input) {

    switch (input.function) {
      case 'getProjects':
        return this._getProjects();
      case 'getProjectTree':
        if (!input.project_name) {
          throw new Error('Project name is required');
        }
        return this._getProjectTree(input.project_name);
      case 'getProjectFile':
        if (!input.project_name) {
          throw new Error('Project name is required');
        }
        if (!input.file_path) {
          throw new Error('File path is required');
        }
        return this._getProjectFile(input.project_name, input.file_path);
      default:
        throw new Error(`Invalid function: ${input.function}`);
    }
  }

  cleanup() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = DavinciProjectFiles;
