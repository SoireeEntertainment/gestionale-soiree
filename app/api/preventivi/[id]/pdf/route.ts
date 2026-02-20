import { NextResponse } from 'next/server'
import { getPreventivo } from '@/app/actions/preventivi'
import { getAuthUserId } from '@/lib/auth-dev'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  _request: Request,
  segmentData: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const params = await segmentData.params
  const preventivo = await getPreventivo(params.id)
  if (!preventivo) return NextResponse.json({ error: 'Preventivo non trovato' }, { status: 404 })

  if (preventivo.type === 'UPLOADED' && preventivo.filePath) {
    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    const fullPath = path.resolve(process.cwd(), preventivo.filePath)
    if (!fullPath.startsWith(uploadsRoot + path.sep)) {
      return NextResponse.json({ error: 'Percorso file non valido' }, { status: 400 })
    }
    try {
      const buf = await fs.readFile(fullPath)
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${preventivo.title.replace(/"/g, '')}.pdf"`,
        },
      })
    } catch {
      return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
    }
  }

  if (preventivo.type === 'GENERATED') {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const pageW = 210 // A4 width in mm
    let y = 20

    doc.setFontSize(18)
    doc.text('Preventivo', 20, y)
    y += 10
    doc.setFontSize(12)
    doc.text(`Cliente: ${preventivo.client.name}`, 20, y)
    y += 6
    doc.text(`Titolo: ${preventivo.title}`, 20, y)
    y += 6
    doc.text(`Data: ${new Date(preventivo.createdAt).toLocaleDateString('it-IT')}`, 20, y)
    y += 12

    if (preventivo.items.length > 0) {
      doc.setFontSize(11)
      doc.text('Descrizione', 20, y)
      doc.text('Qtà', 100, y)
      doc.text('Prezzo unit.', 120, y)
      doc.text('Importo', 160, y)
      y += 6
      doc.setDrawColor(200, 200, 200)
      doc.line(20, y, pageW - 20, y)
      y += 6

      let total = 0
      for (const item of preventivo.items) {
        const amount = item.quantity * item.unitPrice
        total += amount
        doc.text(item.description.substring(0, 45), 20, y)
        doc.text(String(item.quantity), 100, y)
        doc.text(item.unitPrice.toFixed(2), 120, y)
        doc.text(amount.toFixed(2), 160, y)
        y += 6
        if (y > 270) {
          doc.addPage()
          y = 20
        }
      }
      y += 4
      doc.setFontSize(12)
      doc.text(`Totale: € ${total.toFixed(2)}`, 120, y)
      y += 10
    }

    if (preventivo.notes) {
      if (y > 250) {
        doc.addPage()
        y = 20
      }
      doc.setFontSize(10)
      doc.text('Note:', 20, y)
      y += 5
      const lines = doc.splitTextToSize(preventivo.notes, pageW - 40)
      doc.text(lines, 20, y)
    }

    const pdfBuf = Buffer.from(doc.output('arraybuffer'))
    return new NextResponse(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${preventivo.title.replace(/"/g, '')}.pdf"`,
      },
    })
  }

  return NextResponse.json({ error: 'Preventivo non esportabile' }, { status: 400 })
}
