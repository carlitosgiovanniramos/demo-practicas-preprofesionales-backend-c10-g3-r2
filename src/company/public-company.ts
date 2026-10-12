// Lo único de la empresa que viaja junto a una oferta o una postulación para
// cualquier rol: RUC y correo de contacto no salen del directorio de empresas
// (H-04). Una sola definición para que ningún endpoint se quede atrás.
export const PUBLIC_COMPANY = { select: { id: true, name: true } } as const
