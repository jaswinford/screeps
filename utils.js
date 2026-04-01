var config = require('config');

// Module-level terrain cache: { [roomName]: { tick: number, terrain: RoomTerrain } }
var _terrainCache = {};

module.exports = {
    /**
     * Checks if spawn is full and builds additional energy storage if needed.
     * Throttled to run once every config.structures.buildCheckInterval ticks.
     * @param {Room} room - The room to check
     * @returns {boolean} - True if new construction sites were created
     */
    buildEnergyStorageWhenSpawnFull: function(room) {
        // Skip if we don't have visibility in the room
        if (!room) {
            return false;
        }

        // Throttle: only run every buildCheckInterval ticks
        if (Game.time % config.structures.buildCheckInterval !== 0) {
            return false;
        }

        // Get the spawn in the room
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) {
            return false;
        }

        const spawn = spawns[0];

        // Check if spawn energy is full
        if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return false;
        }

        // Check if extensions are also full
        const extensions = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => {
                return structure.structureType === STRUCTURE_EXTENSION &&
                       structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
            }
        });

        // If there are extensions that need energy, don't build more storage yet
        if (extensions.length > 0) {
            return false;
        }

        // Check if we already have a storage structure
        const storages = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_STORAGE
        });

        // Check if we already have storage construction sites
        const storageSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === STRUCTURE_STORAGE
        });

        // If we don't have a storage and no storage construction sites, build one
        if (storages.length === 0 && storageSites.length === 0) {
            // Find a suitable position near the spawn
            const pos = this.findBuildingPosition(spawn.pos, room, 3);
            if (pos) {
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_STORAGE);
                if (result === OK) {
                    console.log(`Created storage construction site at ${pos.x},${pos.y} in ${room.name}`);
                    return true;
                }
            }
        }

        // Check if we need more extensions
        const extensionCount = room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_EXTENSION
        }).length;

        const extensionSites = room.find(FIND_CONSTRUCTION_SITES, {
            filter: (site) => site.structureType === STRUCTURE_EXTENSION
        }).length;

        // Get the controller level to determine max extensions
        const controllerLevel = room.controller ? room.controller.level : 0;

        // Calculate max extensions based on controller level
        // RCL 2: 5, RCL 3: 10, RCL 4: 20, RCL 5: 30, RCL 6: 40, RCL 7: 50, RCL 8: 60
        let maxExtensions = 0;
        if (controllerLevel >= 2) maxExtensions = 5;
        if (controllerLevel >= 3) maxExtensions = 10;
        if (controllerLevel >= 4) maxExtensions = 20;
        if (controllerLevel >= 5) maxExtensions = 30;
        if (controllerLevel >= 6) maxExtensions = 40;
        if (controllerLevel >= 7) maxExtensions = 50;
        if (controllerLevel >= 8) maxExtensions = 60;

        // If we haven't reached max extensions, build more
        if (extensionCount + extensionSites < maxExtensions) {
            // Find a suitable position for the extension
            const pos = this.findBuildingPosition(spawn.pos, room, 2);
            if (pos) {
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
                if (result === OK) {
                    console.log(`Created extension construction site at ${pos.x},${pos.y} in ${room.name}`);
                    return true;
                }
            }
        }

        return false;
    },

    /**
     * Finds a suitable position for building a structure.
     * Uses a single room.find() + Set lookup instead of per-tile lookFor() calls.
     * @param {RoomPosition} centerPos - The position to build around
     * @param {Room} room - The room to build in
     * @param {number} range - The range to search around centerPos
     * @returns {RoomPosition|null} - A suitable position or null if none found
     */
    findBuildingPosition: function(centerPos, room, range) {
        const terrain = room.getTerrain();

        // Pre-fetch all occupied positions once instead of calling lookFor() per tile
        const occupied = new Set();
        const structures = room.find(FIND_STRUCTURES);
        const sites = room.find(FIND_CONSTRUCTION_SITES);
        for (const s of structures) occupied.add(`${s.pos.x},${s.pos.y}`);
        for (const s of sites) occupied.add(`${s.pos.x},${s.pos.y}`);

        // Check positions in a spiral pattern around the center
        for (let r = 2; r <= range; r++) {
            for (let x = -r; x <= r; x++) {
                for (let y = -r; y <= r; y++) {
                    // Skip positions that aren't on the edge of the current range
                    if (Math.abs(x) !== r && Math.abs(y) !== r) {
                        continue;
                    }

                    const posX = centerPos.x + x;
                    const posY = centerPos.y + y;

                    // Skip positions outside room boundaries
                    if (posX < 1 || posX > 48 || posY < 1 || posY > 48) {
                        continue;
                    }

                    // Check if the position is walkable (not a wall) and unoccupied
                    if (terrain.get(posX, posY) !== TERRAIN_MASK_WALL &&
                        !occupied.has(`${posX},${posY}`)) {
                        return new RoomPosition(posX, posY, room.name);
                    }
                }
            }
        }

        return null;
    },

    /**
     * Marks an area as dangerous after a creep is killed.
     * Positions are stored as integer keys (x * 50 + y) for efficient access.
     * @param {RoomPosition} position - The position where the creep was killed
     * @param {string} roomName - The name of the room
     */
    markDangerousArea: function(position, roomName) {
        // Skip if dangerous area avoidance is disabled
        if (!config.dangerousAreas.enabled) {
            return;
        }

        // Reset any stale string-key data (migration: wipe old format on first use)
        if (!Memory.dangerousAreas || Memory.dangerousAreas._fmt !== 1) {
            Memory.dangerousAreas = { _fmt: 1 };
        }
        if (!Memory.dangerousAreas[roomName]) {
            Memory.dangerousAreas[roomName] = {};
        }

        // Mark the death position and surrounding tiles as dangerous
        const radius = config.dangerousAreas.radius;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = position.x + dx;
                const y = position.y + dy;

                // Skip positions outside room boundaries
                if (x < 0 || x > 49 || y < 0 || y > 49) {
                    continue;
                }

                // Store as integer key: x * 50 + y
                Memory.dangerousAreas[roomName][x * 50 + y] = 1.0;
            }
        }

        console.log(`Marked area around (${position.x},${position.y}) in ${roomName} as dangerous`);
    },

    /**
     * Tracks creep movement on a tile for road building automation.
     * Caches the terrain object per room per tick to avoid repeated getRoomTerrain() calls.
     * @param {RoomPosition} position - The position to track
     * @param {string} roomName - The name of the room
     * @param {Creep} creep - The creep that is moving
     */
    trackTileUsage: function(position, roomName, creep) {
        // Skip tracking if road automation is disabled
        if (!config.roadAutomation.enabled) {
            return;
        }

        // Initialize memory structure if it doesn't exist
        if (!Memory.tileUsage) {
            Memory.tileUsage = {};
        }
        if (!Memory.tileUsage[roomName]) {
            Memory.tileUsage[roomName] = {};
        }

        // Create a key for this position
        const posKey = `${position.x},${position.y}`;

        // Calculate the movement cost based on terrain and creep fatigue
        let movementCost = 1; // Base cost

        // Add cost based on creep's fatigue (if available)
        if (creep && creep.fatigue > 0) {
            // Normalize fatigue to a reasonable range (1-5)
            movementCost += Math.min(5, creep.fatigue / 2);
        }

        // Check terrain type — use per-tick cached terrain object
        let cached = _terrainCache[roomName];
        if (!cached || cached.tick !== Game.time) {
            _terrainCache[roomName] = { tick: Game.time, terrain: Game.map.getRoomTerrain(roomName) };
            cached = _terrainCache[roomName];
        }
        const terrainType = cached.terrain.get(position.x, position.y);

        // TERRAIN_MASK_SWAMP = 2 — swamps are much more expensive to move through
        if (terrainType === TERRAIN_MASK_SWAMP) {
            movementCost += 5;
        }

        // Increment the usage count for this position, weighted by movement cost
        if (!Memory.tileUsage[roomName][posKey]) {
            Memory.tileUsage[roomName][posKey] = movementCost;
        } else {
            Memory.tileUsage[roomName][posKey] += movementCost;
        }
    },

    /**
     * Collects energy from various sources in priority order: tombstones, dropped energy, sources.
     * Short-circuits: only calls room.find() for the next tier if the current tier has nothing.
     * @param {Creep} creep - The creep that will collect energy
     * @returns {boolean} - True if the creep successfully collected or moved to collect energy
     */
    collectEnergy: function(creep) {
        if (creep.store.getFreeCapacity() === 0) {
            return false;
        }

        // Priority 1: tombstones
        var tombstones = creep.room.find(FIND_TOMBSTONES, {
            filter: (tombstone) => tombstone.store[RESOURCE_ENERGY] > 0
        });
        if (tombstones.length > 0) {
            var target = creep.pos.findClosestByPath(tombstones);
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }

        // Priority 2: dropped energy
        var droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => resource.resourceType == RESOURCE_ENERGY
        });
        if (droppedEnergy.length > 0) {
            var target = creep.pos.findClosestByPath(droppedEnergy);
            if (creep.pickup(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }

        // Priority 3: energy sources
        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => source.energy > 0
        });
        if (sources.length > 0) {
            var target = creep.pos.findClosestByPath(sources);
            if (creep.harvest(target) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return true;
        }

        return false;
    },

    /**
     * Moves a creep to a target with Screeps' built-in path reuse and danger-zone cost matrix.
     * Path cache key uses target.pos (or target directly for RoomPosition objects).
     * Cache invalidation correctly checks memory.currentTask.
     * @param {Creep} creep - The creep to move
     * @param {RoomObject|RoomPosition} target - The target to move to
     * @param {Object} opts - Additional options for moveTo
     * @returns {number} - The result of the move operation
     */
    moveTo: function(creep, target, opts = {}) {
        // Track the current position for road building automation
        this.trackTileUsage(creep.pos, creep.room.name, creep);

        // Build a stable cache key: RoomPositions have x/y/roomName directly;
        // other RoomObjects store position in .pos
        const pos = target.pos || target;
        const cacheKey = `${pos.x},${pos.y},${pos.roomName}`;

        // Check if the cached path is still valid
        if (creep.memory._move &&
            creep.memory._move.target === cacheKey &&
            creep.memory._move.task === creep.memory.currentTask &&
            Game.time - creep.memory._move.tick < 20 &&
            !creep.fatigue
        ) {
            const moveResult = creep.moveByPath(creep.memory._move.path);
            if (moveResult === ERR_NOT_FOUND) {
                delete creep.memory._move;
            } else {
                return moveResult;
            }
        }

        // Add cost matrix for dangerous areas if any exist for this room
        if (config.dangerousAreas.enabled && Memory.dangerousAreas &&
            Memory.dangerousAreas._fmt === 1 && Memory.dangerousAreas[creep.room.name]) {

            const costCallback = (roomName, costMatrix) => {
                if (!Memory.dangerousAreas[roomName]) {
                    return costMatrix;
                }
                if (!costMatrix) {
                    costMatrix = new PathFinder.CostMatrix();
                }

                for (const key in Memory.dangerousAreas[roomName]) {
                    // Integer key: x * 50 + y
                    const k = Number(key);
                    const x = Math.floor(k / 50);
                    const y = k % 50;
                    const dangerLevel = Memory.dangerousAreas[roomName][key];

                    if (creep.memory.role === 'worker') {
                        costMatrix.set(x, y, 255);
                    } else {
                        const penalty = Math.ceil(config.dangerousAreas.costPenalty * dangerLevel);
                        const newCost = Math.min(255, costMatrix.get(x, y) + penalty);
                        costMatrix.set(x, y, newCost);
                    }
                }

                return costMatrix;
            };

            opts.costCallback = costCallback;
        }

        const moveResult = creep.moveTo(target, {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 5,
            ...opts
        });

        // Cache the path returned by the engine (via _move written by Screeps' own moveTo)
        // We only need to store the target+task+tick so cache invalidation works correctly;
        // the actual path bytes are stored by Screeps in creep.memory._move automatically
        // when reusePath > 0. We overwrite just the fields we need to track.
        if (moveResult === OK) {
            // Screeps has already written creep.memory._move.path via reusePath;
            // patch the target key and task so our validation logic works next tick.
            if (!creep.memory._move) creep.memory._move = {};
            creep.memory._move.target = cacheKey;
            creep.memory._move.task = creep.memory.currentTask;
            creep.memory._move.tick = Game.time;
        } else if (moveResult === ERR_NO_PATH) {
            delete creep.memory._move;
        }

        return moveResult;
    },

    /**
     * Decays dangerous areas over time and removes them when they expire.
     * Visuals are drawn only every 10 ticks to reduce overhead.
     */
    decayDangerousAreas: function() {
        // Skip if dangerous area avoidance is disabled
        if (!config.dangerousAreas.enabled) {
            return;
        }

        // Skip if there are no dangerous areas (or data is in old string-key format)
        if (!Memory.dangerousAreas || Memory.dangerousAreas._fmt !== 1) {
            return;
        }

        const drawVisuals = Game.time % 10 === 0;

        // Process each room's dangerous areas
        for (const roomName in Memory.dangerousAreas) {
            if (roomName === '_fmt') continue;

            const roomData = Memory.dangerousAreas[roomName];
            const keys = Object.keys(roomData);

            if (keys.length === 0) {
                delete Memory.dangerousAreas[roomName];
                continue;
            }

            // Get the room object if we have visibility (only needed for visuals)
            const room = drawVisuals ? Game.rooms[roomName] : null;

            let remaining = 0;
            for (const key in roomData) {
                // Decay
                roomData[key] *= config.dangerousAreas.decayRate;
                roomData[key] = Math.round(roomData[key] * 1000) / 1000;

                // Remove entries with very low danger levels
                if (roomData[key] < 0.01) {
                    delete roomData[key];
                    continue;
                }

                remaining++;

                // Draw visuals every 10 ticks only
                if (room) {
                    const k = Number(key);
                    const x = Math.floor(k / 50);
                    const y = k % 50;
                    room.visual.circle(x, y, {
                        fill: 'transparent',
                        radius: 0.5,
                        stroke: 'red',
                        opacity: roomData[key] * 0.5
                    });
                }
            }

            // Clean up room entry if all areas have expired
            if (remaining === 0) {
                delete Memory.dangerousAreas[roomName];
            }
        }
    },

    /**
     * Checks tile usage data and creates road construction sites on tiles with high
     * movement cost-weighted usage.
     * @returns {number} - The number of road construction sites created
     */
    buildRoadsOnHighTraffic: function() {
        // Skip if road automation is disabled
        if (!config.roadAutomation.enabled) {
            return 0;
        }

        // Skip if it's not time to check yet
        if (Game.time % config.roadAutomation.checkInterval !== 0) {
            return 0;
        }

        let roadsBuilt = 0;

        // Process each room's tile usage data
        for (const roomName in Memory.tileUsage) {
            const room = Game.rooms[roomName];

            // Skip rooms we don't have visibility in
            if (!room) {
                continue;
            }

            // Get all positions sorted by movement cost-weighted usage (highest first)
            const positions = [];
            for (const posKey in Memory.tileUsage[roomName]) {
                const costWeightedUsage = Memory.tileUsage[roomName][posKey];
                const [x, y] = posKey.split(',').map(Number);
                positions.push({ x, y, costWeightedUsage });
            }

            // Sort by cost-weighted usage (highest first)
            positions.sort((a, b) => b.costWeightedUsage - a.costWeightedUsage);

            // Build roads on the most frequently used positions
            for (const pos of positions) {
                // Stop if we've built enough roads this check
                if (roadsBuilt >= config.roadAutomation.maxRoadsPerCheck) {
                    break;
                }

                // Skip if cost-weighted usage is below threshold
                if (pos.costWeightedUsage < config.roadAutomation.threshold) {
                    continue;
                }

                const position = new RoomPosition(pos.x, pos.y, roomName);

                // Skip if there's already a road or construction site here
                const structures = position.lookFor(LOOK_STRUCTURES);
                const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
                if (hasRoad) {
                    Memory.tileUsage[roomName][`${pos.x},${pos.y}`] = 0;
                    continue;
                }

                const sites = position.lookFor(LOOK_CONSTRUCTION_SITES);
                const hasRoadSite = sites.some(s => s.structureType === STRUCTURE_ROAD);
                if (hasRoadSite) {
                    continue;
                }

                // Create a road construction site
                const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
                if (result === OK) {
                    roadsBuilt++;
                    console.log(`Created road construction site at ${pos.x},${pos.y} in ${roomName} (cost-weighted usage: ${pos.costWeightedUsage})`);
                    Memory.tileUsage[roomName][`${pos.x},${pos.y}`] = 0;
                }
            }

            // Apply decay to all positions
            for (const posKey in Memory.tileUsage[roomName]) {
                Memory.tileUsage[roomName][posKey] *= config.roadAutomation.decayRate;
                Memory.tileUsage[roomName][posKey] = Math.round(Memory.tileUsage[roomName][posKey] * 10) / 10;

                if (Memory.tileUsage[roomName][posKey] < 0.1) {
                    delete Memory.tileUsage[roomName][posKey];
                }
            }
        }

        return roadsBuilt;
    }
};
