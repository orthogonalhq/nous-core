type KoffiModule = typeof import('koffi')

export function loadKoffi(): KoffiModule {
  return require('koffi') as KoffiModule
}
