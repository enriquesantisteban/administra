export const RENTAL_MONTHS = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

export function normalizeSheetHeader(value: unknown) {
  return String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

export function isCalculatedRentalHeader(header: string) {
  const normalized = normalizeSheetHeader(header)
  return ['TOTAL ALQUILER CON ANGEL', 'TOTAL ALQUILER', 'TOTAL'].includes(normalized)
}

export function isPaymentStatusHeader(header: string) {
  return normalizeSheetHeader(header) === 'PAGADO'
}

const RENTAL_CURRENCY_HEADERS = new Set([
  'TOTAL ALQUILER CON ANGEL',
  'TOTAL ALQUILER',
  'TOTAL',
  'AGUA',
  'LUZ',
  'BASURA',
])

export function getRentalCurrencyFormatRequests(sheetId: number, headers: string[], startColumnIndex: number, startRowIndex: number, endRowIndex?: number) {
  return headers.flatMap((header, index) => {
    if (!RENTAL_CURRENCY_HEADERS.has(normalizeSheetHeader(header))) return []
    const range: { sheetId: number; startRowIndex: number; endRowIndex?: number; startColumnIndex: number; endColumnIndex: number } = {
      sheetId,
      startRowIndex,
      startColumnIndex: startColumnIndex + index,
      endColumnIndex: startColumnIndex + index + 1,
    }
    if (endRowIndex !== undefined) range.endRowIndex = endRowIndex
    return [{
      repeatCell: {
        range,
        cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY' as const, pattern: '#,##0.00 €' } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    }]
  })
}
export function toA1Column(index: number) {
  let number = index + 1
  let column = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    column = String.fromCharCode(65 + remainder) + column
    number = Math.floor((number - 1) / 26)
  }
  return column
}

export function getRentalFormulaCells(headers: string[], startColumnIndex: number, rowNumber: number, locale = 'es') {
  const find = (name: string) => headers.findIndex((header) => normalizeSheetHeader(header) === normalizeSheetHeader(name))
  const ref = (index: number) => `${toA1Column(startColumnIndex + index)}${rowNumber}`
  const formulas = new Map<number, string>()
  const isSpanish = locale.toLowerCase().startsWith('es')
  const ifFunction = isSpanish ? 'SI' : 'IF'
  const orFunction = isSpanish ? 'O' : 'OR'
  const separator = isSpanish ? ';' : ','
  const rent = find('ALQUILER')
  const community = find('COMUNIDAD')
  const light = find('LUZ')
  const water = find('AGUA')
  const waste = find('BASURA')
  const purchases = find('COMPRAS')
  const angel = find('CON ÁNGEL')
  const halfPurchases = find('A MEDIAS')
  const angelTotal = find('TOTAL ALQUILER CON ÁNGEL')
  const rentalTotal = find('TOTAL ALQUILER')
  const total = find('TOTAL')
  const totalComponents = [rent, community, light, water, waste].filter((index) => index >= 0)
  const numeric = (index: number) => `N(${ref(index)})`
  const componentSum = totalComponents.map(numeric).join('+') || '0'

  if (angel >= 0 && rent >= 0 && light >= 0 && water >= 0 && waste >= 0) {
    const angelMarked = `${orFunction}(${ref(angel)}="SI"${separator}${ref(angel)}="SÍ")`
    const sharedCalculation = `(${numeric(rent)}-175)+(${numeric(light)}/3*2)+(${numeric(water)}/3*2)+(${numeric(waste)}/3*2)`

    if (angelTotal >= 0) formulas.set(startColumnIndex + angelTotal, `=${componentSum}`)
    if (rentalTotal >= 0) formulas.set(startColumnIndex + rentalTotal, `=${ifFunction}(${angelMarked}${separator}${sharedCalculation}${separator}${componentSum})`)
  } else if (rentalTotal >= 0 && totalComponents.length > 0) {
    formulas.set(startColumnIndex + rentalTotal, `=${componentSum}`)
  }

  if (total >= 0 && rentalTotal >= 0 && purchases >= 0) {
    const purchasesValue = halfPurchases >= 0
      ? `${ifFunction}(${orFunction}(${ref(halfPurchases)}="SI"${separator}${ref(halfPurchases)}="SÍ")${separator}${numeric(purchases)}/2${separator}${numeric(purchases)})`
      : numeric(purchases)
    formulas.set(startColumnIndex + total, `=${numeric(rentalTotal)}+${purchasesValue}`)
  }

  return formulas
}
