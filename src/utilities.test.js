import {
  calculateDistance,
  toAbsoluteURL,
  ijkToWorld,
  worldToIjk,
} from "./utilities";

describe("calculateDistance", () => {
  it("returns 0 for identical points", () => {
    expect(calculateDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it("computes a simple axis-aligned distance", () => {
    expect(calculateDistance([0, 0, 0], [3, 0, 0])).toBe(3);
  });

  it("computes a 3-4-5 right triangle in the XY plane", () => {
    expect(calculateDistance([0, 0, 0], [3, 4, 0])).toBe(5);
  });

  it("is symmetric (order of points does not matter)", () => {
    const a = [1, -2, 3];
    const b = [4, 5, -6];
    expect(calculateDistance(a, b)).toBeCloseTo(calculateDistance(b, a));
  });

  it("handles a full 3D diagonal", () => {
    // sqrt(1 + 4 + 4) = 3
    expect(calculateDistance([0, 0, 0], [1, 2, 2])).toBeCloseTo(3);
  });
});

describe("toAbsoluteURL", () => {
  it("prefixes a relative path with the current origin", () => {
    expect(toAbsoluteURL("/papi/v1/files/5/data")).toBe(
      window.location.origin + "/papi/v1/files/5/data",
    );
  });

  it("leaves the relative portion untouched", () => {
    expect(toAbsoluteURL("/mira/index.html")).toBe(
      window.location.origin + "/mira/index.html",
    );
  });
});

// Volume fixtures for the coordinate transforms. `direction` is a flat
// row-major 3x3 matrix; the functions treat each row as a basis vector.
const identityVolume = {
  origin: [0, 0, 0],
  spacing: [1, 1, 1],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

// Non-trivial: anisotropic spacing, a translated origin, and a 90-degree
// rotation in the XY plane. Exercises every term of the transform.
const rotatedVolume = {
  origin: [10, 20, 30],
  spacing: [2, 3, 4],
  direction: [0, -1, 0, 1, 0, 0, 0, 0, 1],
};

describe("ijkToWorld", () => {
  it("returns the origin for the [0,0,0] index", () => {
    expect(ijkToWorld([0, 0, 0], identityVolume)).toEqual([0, 0, 0]);
  });

  it("scales by spacing and adds the origin under identity direction", () => {
    const volume = {
      ...identityVolume,
      origin: [10, 20, 30],
      spacing: [2, 3, 4],
    };
    expect(ijkToWorld([1, 1, 1], volume)).toEqual([12, 23, 34]);
  });

  it("applies the direction matrix to the spacing-scaled coordinates", () => {
    // i=1 -> scaled [2,0,0]; row0=[0,-1,0]·[2,0,0]+10 = 10, row1=[1,0,0]·...+20 = 22
    expect(ijkToWorld([1, 0, 0], rotatedVolume)).toEqual([10, 22, 30]);
  });
});

describe("worldToIjk", () => {
  it("returns [0,0,0] for the origin point", () => {
    expect(worldToIjk([0, 0, 0], identityVolume)).toEqual([0, 0, 0]);
  });

  it("is the inverse of ijkToWorld under identity direction", () => {
    const volume = {
      ...identityVolume,
      origin: [10, 20, 30],
      spacing: [2, 3, 4],
    };
    expect(worldToIjk([12, 23, 34], volume)).toEqual([1, 1, 1]);
  });
});

describe("ijkToWorld / worldToIjk round-trip", () => {
  // The two transforms must be exact inverses; this is the property the masking
  // coordinate handoff relies on, so test it directly across several points.
  const points = [
    [0, 0, 0],
    [1, 2, 3],
    [5, 0, 10],
    [12, 7, 3],
  ];

  for (const volume of [identityVolume, rotatedVolume]) {
    for (const ijk of points) {
      it(`recovers ijk=${JSON.stringify(ijk)} for spacing=${JSON.stringify(
        volume.spacing,
      )}`, () => {
        const recovered = worldToIjk(ijkToWorld(ijk, volume), volume);
        expect(recovered[0]).toBeCloseTo(ijk[0]);
        expect(recovered[1]).toBeCloseTo(ijk[1]);
        expect(recovered[2]).toBeCloseTo(ijk[2]);
      });
    }
  }
});
