import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

interface MailpitSummary {
  messages: Array<{ ID: string; Subject: string; Created: string; To: Array<{ Address: string }> }>
}

export async function recipientEmailLink(
  request: APIRequestContext,
  recipient: string,
  subject: string,
): Promise<string> {
  const mailpitUrl = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025'
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const list = await request.get(`${mailpitUrl}/api/v1/messages`, { timeout: 5_000 })
    expect(list.status(), 'Mailpit message listing').toBe(200)
    const summary = (await list.json()) as MailpitSummary
    const match = summary.messages
      .filter(
        (message) =>
          message.Subject === subject &&
          message.To.some((to) => to.Address === recipient),
      )
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0]
    if (match) {
      const detail = await request.get(`${mailpitUrl}/api/v1/message/${match.ID}`, {
        timeout: 5_000,
      })
      expect(detail.status(), 'Mailpit message detail').toBe(200)
      const text = String(((await detail.json()) as { Text?: string }).Text ?? '')
      const link = text.match(/https?:\/\/\S+/)?.[0]
      if (!link) throw new Error(`Mailpit message "${subject}" has no action link.`)
      return link
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No "${subject}" email arrived for the temporary test account.`)
}
