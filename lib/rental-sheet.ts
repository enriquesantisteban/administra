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

export function getRentalFormulaCells(headers: string[], startColumnIndex: number, rowNumber: number) {
  const find = (name: string) => headers.findIndex((header) => normalizeSheetHeader(header) === normalizeSheetHeader(name))
  const ref = (index: number) => `${toA1Column(startColumnIndex + index)}${rowNumber}`
  const formulas = new Map<number, string>()
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
  const componentSum = `SUM(${totalComponents.map(ref).join(',')})`

  if (angel >= 0 && rent >= 0 && light >= 0 && water >= 0 && waste >= 0) {
    const angelMarked = `OR(${ref(angel)}="SI",${ref(angel)}="SÍ",${ref(angel)}=TRUE)`
    const angelCalculation = `(${ref(rent)}-175)+(${ref(light)}-(${ref(light)}*3/2))+(${ref(water)}-(${ref(water)}*3/2))+(${ref(waste)}-(${ref(waste)}*3/2))`
    const sharedCalculation = `(${ref(rent)}-175)+(${ref(light)}/3*2)+(${ref(water)}/3*2)+(${ref(waste)}/3*2)`

    if (angelTotal >= 0) formulas.set(startColumnIndex + angelTotal, `=IF(${angelMarked},${angelCalculation},"")`)
    if (rentalTotal >= 0) formulas.set(startColumnIndex + rentalTotal, `=IF(${angelMarked},${sharedCalculation},${componentSum})`)
  } else if (rentalTotal >= 0 && totalComponents.length > 0) {
    formulas.set(startColumnIndex + rentalTotal, `=${componentSum}`)
  }

  if (total >= 0 && rentalTotal >= 0 && purchases >= 0) {
    const purchasesValue = halfPurchases >= 0
      ? `IF(OR(${ref(halfPurchases)}="SI",${ref(halfPurchases)}="SÍ",${ref(halfPurchases)}=TRUE),${ref(purchases)}/2,${ref(purchases)})`
      : ref(purchases)
    formulas.set(startColumnIndex + total, `=${ref(rentalTotal)}+${purchasesValue}`)
  }

  return formulas
}
