const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('~/config');

class DavinciProjectFiles extends Tool {
  constructor(fields) {
    super();
    this.userId = fields.userId;
    logger.error('DavinciProjectFiles Fields: ' + JSON.stringify(fields));
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
    this.description_for_model = `// Access files on a developers workstation.
    // General guidelines:
    // - Use getProjects() function to get a list of projects the developer has made available to you.
    // - Use getProjectTree(project_name) to access the file structure of a project.
    // - Use getProjectFile(project_name, file_path) to access the contents of a file.
    `;

    this.ws = null;
    this.wsUrl = `ws://localhost:8001/ws/librechat/${this.userId}/`;
    this.pending_requests = new Map();

    if (!fields.override) {
      logger.error('DavinciProjectFiles override is false or not set');
      this.connectWebSocket();
    } else {
      logger.error('DavinciProjectFiles override is true');
    }
  }

  connectWebSocket() {
    if (this.ws) {
      return;
    }

    logger.error('Initializing WebSocket connection to: ' + this.wsUrl);

    try {
      this.ws = new WebSocket(this.wsUrl, {
        // Add some basic WebSocket options
        handshakeTimeout: 5000,
      });

      // Handle socket states
      this.ws.addEventListener('connecting', () => {
        logger.error('WebSocket connecting...');
      });

      this.ws.addEventListener('open', () => {
        logger.error('WebSocket connected successfully');
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
          logger.error('Received WebSocket message:' + JSON.stringify(response));
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
    logger.error('DavinciProjectFiles _call: ' + this.userId);
    logger.error('DavinciProjectFiles _call: ' + JSON.stringify(input));
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

// const frontend_tree = [];
//
// const backend_tree = [
//   {"type":"directory","name":".","contents":[
//     {"type":"file","name":"./README.md"},
//     {"type":"directory","name":"./api","contents":[
//       {"type":"file","name":"./api/__init__.py"},
//       {"type":"file","name":"./api/auto_schema.py"},
//       {"type":"directory","name":"./api/filters","contents":[
//         {"type":"file","name":"./api/filters/__init__.py"},
//         {"type":"file","name":"./api/filters/agent_filter.py"},
//         {"type":"file","name":"./api/filters/comment_filter.py"},
//         {"type":"file","name":"./api/filters/compass_user_filter.py"},
//         {"type":"file","name":"./api/filters/customer_filter.py"},
//         {"type":"file","name":"./api/filters/davinci_object_filter.py"},
//         {"type":"file","name":"./api/filters/microsoft_tenant.py"},
//         {"type":"file","name":"./api/filters/ticket_filter.py"}
//       ]},
//       {"type":"directory","name":"./api/permissions","contents":[
//         {"type":"file","name":"./api/permissions/__init__.py"},
//         {"type":"file","name":"./api/permissions/customer_manager.py"},
//         {"type":"file","name":"./api/permissions/msp_manager.py"}
//       ]},
//       {"type":"directory","name":"./api/serializers","contents":[
//         {"type":"file","name":"./api/serializers/TTS_message.py"},
//         {"type":"file","name":"./api/serializers/__init__.py"},
//         {"type":"file","name":"./api/serializers/agent.py"},
//         {"type":"file","name":"./api/serializers/agent_commands.py"},
//         {"type":"file","name":"./api/serializers/agent_device_update.py"},
//         {"type":"file","name":"./api/serializers/agent_upload.py"},
//         {"type":"file","name":"./api/serializers/agent_version.py"},
//         {"type":"file","name":"./api/serializers/attachment.py"},
//         {"type":"file","name":"./api/serializers/chad_message.py"},
//         {"type":"file","name":"./api/serializers/chad_session.py"},
//         {"type":"file","name":"./api/serializers/comment.py"},
//         {"type":"file","name":"./api/serializers/compassuser.py"},
//         {"type":"file","name":"./api/serializers/currentuser.py"},
//         {"type":"file","name":"./api/serializers/customer.py"},
//         {"type":"file","name":"./api/serializers/email.py"},
//         {"type":"file","name":"./api/serializers/email_template.py"},
//         {"type":"file","name":"./api/serializers/microsoft_tenant.py"},
//         {"type":"file","name":"./api/serializers/microsoft_user.py"},
//         {"type":"file","name":"./api/serializers/msp_settings.py"},
//         {"type":"file","name":"./api/serializers/photo.py"},
//         {"type":"file","name":"./api/serializers/product.py"},
//         {"type":"file","name":"./api/serializers/product_family.py"},
//         {"type":"file","name":"./api/serializers/response_report.py"},
//         {"type":"file","name":"./api/serializers/shame_report.py"},
//         {"type":"file","name":"./api/serializers/smtp_relay.py"},
//         {"type":"file","name":"./api/serializers/subscribed_sku.py"},
//         {"type":"file","name":"./api/serializers/ticket.py"},
//         {"type":"file","name":"./api/serializers/ticket_report.py"}
//       ]},
//       {"type":"directory","name":"./api/tests","contents":[
//         {"type":"file","name":"./api/tests/__init__.py"},
//         {"type":"file","name":"./api/tests/test_permissions.py"}
//       ]},
//       {"type":"file","name":"./api/urls.py"},
//       {"type":"directory","name":"./api/views","contents":[
//         {"type":"file","name":"./api/views/__init__.py"},
//         {"type":"file","name":"./api/views/auth_url.py"},
//         {"type":"file","name":"./api/views/response_report.py"},
//         {"type":"file","name":"./api/views/shame_report.py"},
//         {"type":"file","name":"./api/views/ticket_report.py"}
//       ]},
//       {"type":"directory","name":"./api/viewsets","contents":[
//         {"type":"file","name":"./api/viewsets/TTS_message.py"},
//         {"type":"file","name":"./api/viewsets/TTS_parameters.py"},
//         {"type":"file","name":"./api/viewsets/__init__.py"},
//         {"type":"file","name":"./api/viewsets/agent.py"},
//         {"type":"file","name":"./api/viewsets/agent_command.py"},
//         {"type":"file","name":"./api/viewsets/agent_device_update.py"},
//         {"type":"file","name":"./api/viewsets/agent_upload.py"},
//         {"type":"file","name":"./api/viewsets/agent_version.py"},
//         {"type":"file","name":"./api/viewsets/chad_messages.py"},
//         {"type":"file","name":"./api/viewsets/chad_session.py"},
//         {"type":"file","name":"./api/viewsets/comment.py"},
//         {"type":"file","name":"./api/viewsets/compassuser.py"},
//         {"type":"file","name":"./api/viewsets/currentuser.py"},
//         {"type":"file","name":"./api/viewsets/customer.py"},
//         {"type":"file","name":"./api/viewsets/email.py"},
//         {"type":"file","name":"./api/viewsets/email_template.py"},
//         {"type":"file","name":"./api/viewsets/microsoft_tenant.py"},
//         {"type":"file","name":"./api/viewsets/microsoft_user.py"},
//         {"type":"file","name":"./api/viewsets/msp_settings.py"},
//         {"type":"file","name":"./api/viewsets/photo.py"},
//         {"type":"file","name":"./api/viewsets/product.py"},
//         {"type":"file","name":"./api/viewsets/product_family.py"},
//         {"type":"file","name":"./api/viewsets/smtp_relay.py"},
//         {"type":"file","name":"./api/viewsets/subscribed_sku.py"},
//         {"type":"file","name":"./api/viewsets/ticket.py"}
//       ]}
//     ]},
//     {"type":"file","name":"./cert.crt"},
//     {"type":"file","name":"./cert.key"},
//     {"type":"directory","name":"./compass","contents":[
//       {"type":"file","name":"./compass/__init__.py"},
//       {"type":"file","name":"./compass/asgi.py"},
//       {"type":"file","name":"./compass/celery.py"},
//       {"type":"file","name":"./compass/logging_handlers.py"},
//       {"type":"directory","name":"./compass/middleware","contents":[
//         {"type":"file","name":"./compass/middleware/__init__.py"},
//         {"type":"file","name":"./compass/middleware/exception.py"}
//       ]},
//       {"type":"file","name":"./compass/settings.py"},
//       {"type":"file","name":"./compass/urls.py"},
//       {"type":"file","name":"./compass/wsgi.py"}
//     ]},
//     {"type":"file","name":"./daphne_debug.py"},
//     {"type":"directory","name":"./docker","contents":[
//       {"type":"file","name":"./docker/Dockerfile.dev.proxy"},
//       {"type":"file","name":"./docker/Dockerfile.django"},
//       {"type":"file","name":"./docker/Dockerfile.proxy"},
//       {"type":"file","name":"./docker/build-image.sh"},
//       {"type":"file","name":"./docker/cert.crt"},
//       {"type":"file","name":"./docker/cert.key"},
//       {"type":"directory","name":"./docker/compass-helm","contents":[
//         {"type":"file","name":"./docker/compass-helm/Chart.yaml"},
//         {"type":"directory","name":"./docker/compass-helm/templates","contents":[
//           {"type":"file","name":"./docker/compass-helm/templates/certificate.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/compass-celerybeat.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/compass-celeryworker.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/compass-django.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/compass-react.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/ingress.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/persistent-volume-claim.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/persistent-volume.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/postgres.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/rabbitmq.yaml"},
//           {"type":"file","name":"./docker/compass-helm/templates/redis.yaml"}
//         ]},
//         {"type":"file","name":"./docker/compass-helm/values.yaml"}
//       ]},
//       {"type":"directory","name":"./docker/compose","contents":[
//         {"type":"file","name":"./docker/compose/development.env"},
//         {"type":"file","name":"./docker/compose/docker-compose-dev.yml"},
//         {"type":"file","name":"./docker/compose/docker-compose.yml"}
//       ]},
//       {"type":"file","name":"./docker/django.supervisor"},
//       {"type":"file","name":"./docker/nginx.dev.proxy.conf"},
//       {"type":"file","name":"./docker/nginx.proxy.conf"},
//       {"type":"file","name":"./docker/prd-build-image.sh"},
//       {"type":"file","name":"./docker/start_services.sh"}
//     ]},
//     {"type":"file","name":"./email_test.py"},
//     {"type":"directory","name":"./main","contents":[
//       {"type":"file","name":"./main/__init__.py"},
//       {"type":"file","name":"./main/admin.py"},
//       {"type":"directory","name":"./main/agents","contents":[
//         {"type":"file","name":"./main/agents/__init__.py"},
//         {"type":"file","name":"./main/agents/email_routing_agent.py"}
//       ]},
//       {"type":"file","name":"./main/apps.py"},
//       {"type":"directory","name":"./main/interfaces","contents":[
//         {"type":"file","name":"./main/interfaces/__init__.py"},
//         {"type":"directory","name":"./main/interfaces/microsoft","contents":[
//           {"type":"file","name":"./main/interfaces/microsoft/__init__.py"},
//           {"type":"file","name":"./main/interfaces/microsoft/microsoft_api.py"},
//           {"type":"file","name":"./main/interfaces/microsoft/microsoft_mock_api.py"}
//         ]}
//       ]},
//       {"type":"directory","name":"./main/management","contents":[
//         {"type":"file","name":"./main/management/__init__.py"},
//         {"type":"directory","name":"./main/management/commands","contents":[
//           {"type":"file","name":"./main/management/commands/__init__.py"},
//           {"type":"file","name":"./main/management/commands/email_test.py"},
//           {"type":"file","name":"./main/management/commands/initdata.py"},
//           {"type":"file","name":"./main/management/commands/issue_token.py"},
//           {"type":"file","name":"./main/management/commands/kb_api.py"},
//           {"type":"file","name":"./main/management/commands/load_atera_customers.py"},
//           {"type":"file","name":"./main/management/commands/load_atera_tickets.py"},
//           {"type":"file","name":"./main/management/commands/load_atera_users.py"},
//           {"type":"file","name":"./main/management/commands/load_licensing_meta.py"},
//           {"type":"file","name":"./main/management/commands/load_smtp.py"},
//           {"type":"file","name":"./main/management/commands/model_test.py"},
//           {"type":"file","name":"./main/management/commands/monitor_tasks.py"},
//           {"type":"file","name":"./main/management/commands/submit_sku_task.py"},
//           {"type":"file","name":"./main/management/commands/task_status.py"},
//           {"type":"file","name":"./main/management/commands/trigger_agent_update.py"}
//         ]}
//       ]},
//       {"type":"file","name":"./main/managers.py"},
//       {"type":"directory","name":"./main/migrations","contents":[
//         {"type":"file","name":"./main/migrations/0001_initial.py"},
//         {"type":"file","name":"./main/migrations/0002_chadsession.py"},
//         {"type":"file","name":"./main/migrations/0003_chadmessage.py"},
//         {"type":"file","name":"./main/migrations/0004_chadmessage_user.py"},
//         {"type":"file","name":"./main/migrations/0005_alter_ticket_status.py"},
//         {"type":"file","name":"./main/migrations/0006_customer_msp_alter_ticket_customer.py"},
//         {"type":"file","name":"./main/migrations/0007_alter_compassuser_phone.py"},
//         {"type":"file","name":"./main/migrations/0008_prepare_users.py"},
//         {"type":"file","name":"./main/migrations/0009_remove_microsoftuser_ms_tenant_id_and_more.py"},
//         {"type":"file","name":"./main/migrations/0010_agent.py"},
//         {"type":"file","name":"./main/migrations/0010_alter_ticket_status_ttsmessage.py"},
//         {"type":"file","name":"./main/migrations/0011_merge_0010_agent_0010_alter_ticket_status_ttsmessage.py"},
//         {"type":"file","name":"./main/migrations/0012_agent_customer_agent_device_id_agent_device_name_and_more.py"},
//         {"type":"file","name":"./main/migrations/0012_ticket_urgency.py"},
//         {"type":"file","name":"./main/migrations/0013_merge_20240418_2311.py"},
//         {"type":"file","name":"./main/migrations/0014_smtprelay_smart_host_auth_and_more.py"},
//         {"type":"file","name":"./main/migrations/0015_licensingmeta_customer_companycam_key_and_more.py"},
//         {"type":"file","name":"./main/migrations/0016_customer_alias_ticket_compass_ticket_id_and_more.py"},
//         {"type":"file","name":"./main/migrations/0017_agentversion_agent_version.py"},
//         {"type":"file","name":"./main/migrations/0018_compassuser_is_hidden.py"},
//         {"type":"file","name":"./main/migrations/0018_email.py"},
//         {"type":"file","name":"./main/migrations/0019_alter_customer_agent_token.py"},
//         {"type":"file","name":"./main/migrations/0020_customer_inactive_since_customer_is_active.py"},
//         {"type":"file","name":"./main/migrations/0021_merge_20241202_1458.py"},
//         {"type":"file","name":"./main/migrations/0022_alter_agent_device_id_alter_agent_status.py"},
//         {"type":"file","name":"./main/migrations/0023_agent_connected_network_name_and_more.py"},
//         {"type":"file","name":"./main/migrations/0024_compassuser_is_technician.py"},
//         {"type":"file","name":"./main/migrations/0025_alter_compassuser_email.py"},
//         {"type":"file","name":"./main/migrations/0026_compassuser_is_manager.py"},
//         {"type":"file","name":"./main/migrations/0027_attachment.py"},
//         {"type":"file","name":"./main/migrations/0028_alter_comment_options_email_inbound_email_msp_and_more.py"},
//         {"type":"file","name":"./main/migrations/0028_remove_ticket_compass_ticket_id_ticket_ticket_id_and_more.py"},
//         {"type":"file","name":"./main/migrations/0029_create_email_templates_and_msp_settings.py"},
//         {"type":"file","name":"./main/migrations/0030_merge_20250104_0325.py"},
//         {"type":"file","name":"./main/migrations/0031_alter_ticket_options_alter_mspsettings_customer.py"},
//         {"type":"file","name":"./main/migrations/0032_ticket_hashed_compass_ticket_id.py"},
//         {"type":"file","name":"./main/migrations/0033_alter_mspsettings_inbound_email.py"},
//         {"type":"file","name":"./main/migrations/0034_ticket_watchers.py"},
//         {"type":"file","name":"./main/migrations/0035_alter_ticket_ticket_id.py"},
//         {"type":"file","name":"./main/migrations/0036_remove_ticket_hashed_compass_ticket_id.py"},
//         {"type":"file","name":"./main/migrations/0037_alter_ticket_ticket_id.py"},
//         {"type":"file","name":"./main/migrations/__init__.py"}
//       ]},
//       {"type":"directory","name":"./main/models","contents":[
//         {"type":"file","name":"./main/models/TTS_message.py"},
//         {"type":"file","name":"./main/models/__init__.py"},
//         {"type":"file","name":"./main/models/agent.py"},
//         {"type":"file","name":"./main/models/agent_command.py"},
//         {"type":"file","name":"./main/models/agent_device_update.py"},
//         {"type":"file","name":"./main/models/agent_version.py"},
//         {"type":"file","name":"./main/models/attachment.py"},
//         {"type":"file","name":"./main/models/chad_message.py"},
//         {"type":"file","name":"./main/models/chad_session.py"},
//         {"type":"file","name":"./main/models/comment.py"},
//         {"type":"file","name":"./main/models/compass_user.py"},
//         {"type":"directory","name":"./main/models/custom_fields","contents":[
//           {"type":"file","name":"./main/models/custom_fields/__init__.py"},
//           {"type":"file","name":"./main/models/custom_fields/lowercase_email_field.py"}
//         ]},
//         {"type":"file","name":"./main/models/customer.py"},
//         {"type":"file","name":"./main/models/davinci_model.py"},
//         {"type":"file","name":"./main/models/email.py"},
//         {"type":"file","name":"./main/models/email_template.py"},
//         {"type":"file","name":"./main/models/licensing_meta.py"},
//         {"type":"file","name":"./main/models/microsoft_tenant.py"},
//         {"type":"file","name":"./main/models/microsoft_user.py"},
//         {"type":"file","name":"./main/models/msp_settings.py"},
//         {"type":"file","name":"./main/models/product.py"},
//         {"type":"file","name":"./main/models/product_family.py"},
//         {"type":"file","name":"./main/models/smtp_relay.py"},
//         {"type":"file","name":"./main/models/subscribed_sku.py"},
//         {"type":"file","name":"./main/models/ticket.py"}
//       ]},
//       {"type":"file","name":"./main/models.py"},
//       {"type":"file","name":"./main/signals.py"},
//       {"type":"directory","name":"./main/tasks","contents":[
//         {"type":"file","name":"./main/tasks/__init__.py"},
//         {"type":"file","name":"./main/tasks/agent_msi_create.py"},
//         {"type":"file","name":"./main/tasks/atera_api_call.py"},
//         {"type":"file","name":"./main/tasks/fetch_media.py"},
//         {"type":"file","name":"./main/tasks/generate_chad_response.py"},
//         {"type":"file","name":"./main/tasks/process_atera_customers.py"},
//         {"type":"file","name":"./main/tasks/process_atera_tickets.py"},
//         {"type":"file","name":"./main/tasks/process_atera_users.py"},
//         {"type":"file","name":"./main/tasks/process_inbound_email.py"},
//         {"type":"file","name":"./main/tasks/rename_chad_session.py"},
//         {"type":"file","name":"./main/tasks/send_email.py"},
//         {"type":"file","name":"./main/tasks/status_checks.py"},
//         {"type":"file","name":"./main/tasks/update_sku_data.py"}
//       ]},
//       {"type":"directory","name":"./main/unit_tests","contents":[
//         {"type":"file","name":"./main/unit_tests/__init__.py"},
//         {"type":"file","name":"./main/unit_tests/test_email_input.py"},
//         {"type":"file","name":"./main/unit_tests/test_microsoft_oauth.py"}
//       ]},
//       {"type":"file","name":"./main/urls.py"},
//       {"type":"directory","name":"./main/views","contents":[
//         {"type":"file","name":"./main/views/__init__.py"},
//         {"type":"file","name":"./main/views/admin_auth.py"},
//         {"type":"file","name":"./main/views/agent_auth.py"},
//         {"type":"file","name":"./main/views/auth.py"},
//         {"type":"file","name":"./main/views/home.py"},
//         {"type":"file","name":"./main/views/status.py"}
//       ]}
//     ]},
//     {"type":"file","name":"./manage.py"},
//     {"type":"directory","name":"./modules","contents":[
//       {"type":"directory","name":"./modules/text_to_speech","contents":[
//         {"type":"file","name":"./modules/text_to_speech/tts_connect.py"}
//       ]}
//     ]},
//     {"type":"file","name":"./pytest.ini"},
//     {"type":"file","name":"./requirements.ml_worker.txt"},
//     {"type":"file","name":"./requirements.txt"},
//     {"type":"file","name":"./schema.yaml"},
//     {"type":"directory","name":"./templates","contents":[
//       {"type":"file","name":"./templates/admin_auth_result.html"},
//       {"type":"file","name":"./templates/agent_auth.html"}
//     ]},
//     {"type":"directory","name":"./tmp"},
//     {"type":"file","name":"./tree.txt"},
//     {"type":"directory","name":"./websockets","contents":[
//       {"type":"file","name":"./websockets/__init__.py"},
//       {"type":"file","name":"./websockets/admin.py"},
//       {"type":"file","name":"./websockets/apps.py"},
//       {"type":"directory","name":"./websockets/consumers","contents":[
//         {"type":"file","name":"./websockets/consumers/__init__.py"},
//         {"type":"file","name":"./websockets/consumers/agent.py"},
//         {"type":"file","name":"./websockets/consumers/chad.py"},
//         {"type":"file","name":"./websockets/consumers/text_room.py"}
//       ]},
//       {"type":"directory","name":"./websockets/migrations","contents":[
//         {"type":"file","name":"./websockets/migrations/__init__.py"}
//       ]},
//       {"type":"file","name":"./websockets/models.py"},
//       {"type":"file","name":"./websockets/routing.py"},
//       {"type":"file","name":"./websockets/tests.py"},
//       {"type":"file","name":"./websockets/views.py"}
//     ]},
//     {"type":"file","name":"./worker_debug.py"}
//   ]}
// ];
//
