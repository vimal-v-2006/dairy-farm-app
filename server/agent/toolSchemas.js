const { z } = require('zod');

const toolSchemas = {
  queryDatabase: z.object({
    sql: z.string().min(1),
    params: z.array(z.any()).optional()
  }),
  prepareWrite: z.object({
    sql: z.string().min(1),
    params: z.array(z.any()).optional(),
    preview: z.string().min(1)
  })
};

const toolDefinitions = [
  { name: 'queryDatabase', description: 'Execute a SELECT SQL query against the SQLite database. Read-only. Returns matching rows.', parameters: { sql: 'SELECT statement', params: 'optional array of parameter values for ? placeholders' } },
  { name: 'prepareWrite', description: 'Prepare an INSERT/UPDATE/DELETE SQL statement for execution. Does NOT write until user confirms. Provide a human-readable preview describing what will change.', parameters: { sql: 'INSERT/UPDATE/DELETE statement with ? placeholders', params: 'array of parameter values', preview: 'short human description of the change for confirmation dialog' } }
];

function validateToolArguments(toolName, args) {
  const schema = toolSchemas[toolName];
  if (!schema) throw new Error(`Unknown tool: ${toolName}`);
  return schema.parse(args || {});
}

module.exports = {
  toolDefinitions,
  toolSchemas,
  validateToolArguments
};
