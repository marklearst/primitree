import fs from 'node:fs/promises'
import path from 'node:path'
import type { PipelineFile } from '@primitree/dtcg'

export async function readJsonFile(filePath: string): Promise<unknown> {
  const absolute = path.resolve(filePath)
  let raw: string
  try {
    raw = await fs.readFile(absolute, 'utf8')
  } catch {
    throw new Error(`Could not read file: ${absolute}`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`File is not valid JSON: ${absolute}`)
  }
}

export async function writePipelineFiles(
  outDir: string,
  files: PipelineFile[]
): Promise<string[]> {
  const written: string[] = []
  for (const file of files) {
    const target = path.resolve(outDir, file.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.contents, 'utf8')
    written.push(target)
  }
  return written
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}
