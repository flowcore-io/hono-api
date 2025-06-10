export enum Style {
  BOLD = 1,
  THIN = 2,
  ITALIC = 3,
  PURPLE = 35,
  CYAN = 36,
  GREEN = 32,
  YELLOW = 33,
  RED = 31,
  GRAY = 90,
}

const PREFIX = "\x1b"

export const colorize = (text: string, style: Style[]) => {
  if (!style.length) {
    return text
  }
  return `${PREFIX}[${style.join(";")}m${text}${PREFIX}[0m`
}
