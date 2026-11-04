'use strict'

const {
  keyLocation,
  byLocationKey
} = require('./location')

/**
 * @typedef {object} DataPoint
 * @property {string} functionName
 * @property {number} line
 * @property {number} column
 * @property {number} [id]
 */

/** @typedef {Map<string, DataPoint>} DataPointsByLocation */

/**
 * @typedef {object} RawFileGroup
 * @property {DataPoint[]} ics
 * @property {DataPoint[]} deopts
 * @property {DataPoint[]} codes
 */

/**
 * @typedef {object} GroupedFileGroup
 * @property {DataPointsByLocation} ics
 * @property {DataPointsByLocation} deopts
 * @property {DataPointsByLocation} codes
 * @property {string[]} icLocations
 * @property {string[]} deoptLocations
 * @property {string[]} codeLocations
 */

class FileLocationGrouper {
  /** @param {RawFileGroup} fileGroup */
  constructor (fileGroup) {
    /** @type {number} */
    this._id = 0
    /** @type {RawFileGroup} */
    this._fileGroup = fileGroup
  }

  /**
   * Collect and sort all unique locations in the file group.
   * @returns {{
   *   icsByLocation: DataPointsByLocation,
   *   deoptsByLocation: DataPointsByLocation,
   *   codesByLocation: DataPointsByLocation,
   *   icLocations: string[],
   *   deoptLocations: string[],
   *   codeLocations: string[]
   * }}
   */
  locationsForFileGroup () {
    this._icsByLocation = new Map()
    this._deoptsByLocation = new Map()
    this._codesByLocation = new Map()

    this._deoptLocations = new Set()
    this._icLocations = new Set()
    this._codeLocations = new Set()

    const { ics, deopts, codes } = this._fileGroup
    const {
      dataByLocation: icsByLocation,
      locations: icLocations
    } = this._extractLocations(ics)
    const {
      dataByLocation: deoptsByLocation,
      locations: deoptLocations
    } = this._extractLocations(deopts)
    const {
      dataByLocation: codesByLocation,
      locations: codeLocations
    } = this._extractLocations(codes)

    const sortedIcLocations = Array.from(icLocations).sort(byLocationKey)
    const sortedDeoptLocations = Array.from(deoptLocations).sort(byLocationKey)
    const sortedCodeLocations = Array.from(codeLocations).sort(byLocationKey)
    return {
      icsByLocation,
      deoptsByLocation,
      codesByLocation,
      icLocations: sortedIcLocations,
      deoptLocations: sortedDeoptLocations,
      codeLocations: sortedCodeLocations
    }
  }

  /**
   * Index data points by source location and assign each point a stable ID.
   * @param {DataPoint[]} dataPoints
   * @returns {{dataByLocation: DataPointsByLocation, locations: Set<string>}}
   */
  _extractLocations (dataPoints) {
    const dataByLocation = new Map()
    const locations = new Set()
    for (const dataPoint of dataPoints) {
      const { functionName, line, column } = dataPoint
      const locationKey = keyLocation({ functionName, line, column })
      locations.add(locationKey)
      dataPoint.id = this._id++
      dataByLocation.set(locationKey, dataPoint)
    }
    return { dataByLocation, locations }
  }
}

/**
 * Replace each file group's point arrays with maps keyed by source location.
 * @param {Map<string, RawFileGroup>} groupedByFile
 * @returns {Map<string, GroupedFileGroup>}
 */
function groupByFileAndLocation (groupedByFile) {
  const groupedByFileAndLocation = new Map()
  for (const [file, fileGroup] of groupedByFile) {
    const fileLocationGrouper = new FileLocationGrouper(fileGroup)

    const {
      icsByLocation,
      deoptsByLocation,
      codesByLocation,
      deoptLocations,
      icLocations,
      codeLocations
    } = fileLocationGrouper.locationsForFileGroup()

    groupedByFileAndLocation
      .set(file, Object.assign(fileGroup, {
        ics: icsByLocation,
        deopts: deoptsByLocation,
        codes: codesByLocation,
        deoptLocations,
        icLocations,
        codeLocations
      }))
  }

  return groupedByFileAndLocation
}

module.exports = groupByFileAndLocation
