import * as math from "mathjs";
// import { convertCoordinatesNew as convertCoordinates } from './masking';

// The old one
import { convertCoordinates } from "./masking";

describe("convertCoordinates", () => {
  it("should transform coordinates with identity direction and spacing", () => {
    const coords = {
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
      z: { min: 0, max: 1 },
    };
    const volume = {
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      dimensions: [200, 200, 200],
    };
    const targetDirection = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = convertCoordinates(coords, volume, targetDirection);
    expect(result).toEqual({
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
      z: { min: 0, max: 1 },
    });
  });

  it("should apply spacing and origin correctly", () => {
    const coords = {
      x: { min: 1, max: 2 },
      y: { min: 3, max: 4 },
      z: { min: 5, max: 6 },
    };
    const volume = {
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [10, 20, 30],
      spacing: [2, 3, 4],
      dimensions: [200, 200, 200],
    };
    const targetDirection = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = convertCoordinates(coords, volume, targetDirection);
    expect(result).toEqual({
      x: { min: 12, max: 14 },
      y: { min: 29, max: 32 },
      z: { min: 50, max: 54 },
    });
  });

  it("should handle non-identity direction", () => {
    const coords = {
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
      z: { min: 0, max: 1 },
    };
    const volume = {
      direction: [0, -1, 0, 1, 0, 0, 0, 0, 1], // 90 degree rotation in XY
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      dimensions: [200, 200, 200],
    };
    const targetDirection = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = convertCoordinates(coords, volume, targetDirection);
    // The x and y axes are swapped and y is negated
    expect(result.x.min).toBeCloseTo(-1);
    expect(result.x.max).toBeCloseTo(0);
    expect(result.y.min).toBeCloseTo(0);
    expect(result.y.max).toBeCloseTo(1);
    expect(result.z.min).toBeCloseTo(0);
    expect(result.z.max).toBeCloseTo(1);
  });

  it("should handle non-identity targetDirection", () => {
    const coords = {
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
      z: { min: 0, max: 1 },
    };
    const volume = {
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      dimensions: [200, 200, 200],
    };
    const targetDirection = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, 1],
    ];
    const result = convertCoordinates(coords, volume, targetDirection);
    expect(result.x.min).toBeCloseTo(-1);
    expect(result.x.max).toBeCloseTo(0);
    expect(result.y.min).toBeCloseTo(-1);
    expect(result.y.max).toBeCloseTo(0);
    expect(result.z.min).toBeCloseTo(0);
    expect(result.z.max).toBeCloseTo(1);
  });

  it("should handle negative spacing", () => {
    const coords = {
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
      z: { min: 0, max: 1 },
    };
    const volume = {
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      origin: [0, 0, 0],
      spacing: [-1, -1, -1],
      dimensions: [200, 200, 200],
    };
    const targetDirection = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result = convertCoordinates(coords, volume, targetDirection);
    expect(result.x.min).toBeCloseTo(-1);
    expect(result.x.max).toBeCloseTo(0);
    expect(result.y.min).toBeCloseTo(-1);
    expect(result.y.max).toBeCloseTo(0);
    expect(result.z.min).toBeCloseTo(-1);
    expect(result.z.max).toBeCloseTo(0);
  });
});
