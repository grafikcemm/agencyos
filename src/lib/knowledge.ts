import 'server-only'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Reads a markdown context file from the project `knowledge/` directory.
// Returns '' when the file is missing so callers can inject optional context
// without guarding every call site.
export function readKnowledgeFile(filename: string): string {
  try {
    const filePath = join(process.cwd(), 'knowledge', filename)
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}
