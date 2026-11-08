import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from 'openapi-typescript-codegen'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'src', 'openapi-generated')
const check = process.argv.includes('--check')
const temporary = check ? await mkdtemp(join(tmpdir(), 'shop-openapi-')) : null
const generated = temporary ?? output

async function files(dir, prefix = '') {
  const entries = await readdir(join(dir, prefix), { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    const name = join(prefix, entry.name)
    if (entry.isDirectory()) result.push(...await files(dir, name))
    else if (entry.isFile()) result.push(name)
    else throw new Error(`Unexpected entry in generated contract: ${name}`)
  }
  return result.sort()
}

try {
  await generate({
    input: resolve(root, '..', '..', 'docs', 'openapi.json'),
    output: generated,
    exportCore: false,
    exportServices: false,
    useUnionTypes: true,
  })
  if (check) {
    const expected = await files(generated)
    let actual
    try {
      actual = await files(output)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      actual = []
    }
    let matches = JSON.stringify(expected) === JSON.stringify(actual)
    if (matches) {
      for (const name of expected) {
        const [left, right] = await Promise.all([
          readFile(join(generated, name), 'utf8'),
          readFile(join(output, name), 'utf8'),
        ])
        if (left.replaceAll('\r\n', '\n') !== right.replaceAll('\r\n', '\n')) {
          matches = false
          break
        }
      }
    }
    if (!matches) {
      console.error('Generated OpenAPI models are outdated. Run npm run contract:generate.')
      process.exitCode = 1
    } else {
      console.log('Generated OpenAPI models match the contract.')
    }
  } else {
    console.log('Generated OpenAPI models updated.')
  }
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true })
}
