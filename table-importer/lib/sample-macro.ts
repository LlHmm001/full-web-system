export const SAMPLE_MACRO_NAME = "示例：第 5 列商标标记";

export const SAMPLE_MACRO_CODE = `function Macro() {
  const sheet = ActiveSheet;
  const replacements = [
    ["当责", "当责®"],
    ["明师优徒", "明师优徒®"],
    ["赢战山河", "赢战山河®"],
    ["五维人才官", "五维人才官®"],
    ["左圆右方", "左圆右方®"],
    ["岗位经验内化", "岗位经验内化™"],
    ["体验创值画布", "体验创值画布™"],
    ["岁月赢家", "岁月赢家™"],
    ["极简绩效", "极简绩效™"],
    ["聚沙成塔", "聚沙成塔™"],
    ["AI搭档", "AI搭档™"],
    ["破壁行动", "破壁行动™"],
    ["赢保制胜", "赢保制胜™"],
    ["管理魔法镜", "管理魔法镜™"],
    ["财效罗盘", "财效罗盘™"],
    ["七个陷阱", "七个陷阱™"]
  ];

  const endRow = ActiveSheet.UsedRange.Rows.Count;
  for (let row = 2; row <= endRow; row++) {
    const cell = sheet.Cells(row, 5);
    if (cell.HasFormula) continue;
    let value = cell.Value2;
    if (value && typeof value === "string") {
      for (const [oldName, newName] of replacements) {
        const suffix = newName.startsWith(oldName) ? newName.slice(oldName.length) : "";
        const pattern = suffix
          ? new RegExp(oldName + "(?!" + suffix + ")", "g")
          : new RegExp(oldName, "g");
        value = value.replace(pattern, newName);
      }
      cell.Value2 = value;
    }
  }
}`;
