import { describe, expect, it } from "vitest";
import {
  SQL_TYPES,
  JAVA_TYPES,
  typeSuggestionsFor,
  baseTypeName,
  isSqlType,
} from "./typeVocabulary.js";

describe("typeVocabulary", () => {
  it("suggests SQL types for ER diagrams", () => {
    // Arrange / Act
    const suggestions = typeSuggestionsFor("er");

    // Assert
    expect(suggestions).toBe(SQL_TYPES);
    expect(suggestions).toContain("VARCHAR");
    expect(suggestions).toContain("TIMESTAMP");
  });

  it("suggests Java types for class diagrams", () => {
    // Arrange / Act
    const suggestions = typeSuggestionsFor("class");

    // Assert
    expect(suggestions).toBe(JAVA_TYPES);
    expect(suggestions).toContain("String");
    expect(suggestions).toContain("BigDecimal");
  });

  it("returns no suggestions for diagram types without typed attributes", () => {
    // Arrange / Act / Assert
    expect(typeSuggestionsFor("c4-context")).toHaveLength(0);
    expect(typeSuggestionsFor("sequence")).toHaveLength(0);
  });

  it("strips parameters and casing when extracting the base type name", () => {
    // Arrange / Act / Assert
    expect(baseTypeName("VARCHAR(255)")).toBe("VARCHAR");
    expect(baseTypeName(" numeric(19,4) ")).toBe("NUMERIC");
    expect(baseTypeName("uuid")).toBe("UUID");
  });

  it("recognises SQL types case-insensitively and with parameters", () => {
    // Arrange / Act / Assert
    expect(isSqlType("VARCHAR(255)")).toBe(true);
    expect(isSqlType("numeric(19,4)")).toBe(true);
    expect(isSqlType("UUID")).toBe(true);
    expect(isSqlType("String")).toBe(false);
    expect(isSqlType("Money")).toBe(false);
  });
});
