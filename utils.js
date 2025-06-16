module.exports = {
    /**
     * Collects energy from various sources in priority order: tombstones, dropped energy, sources
     * @param {Creep} creep - The creep that will collect energy
     * @returns {boolean} - True if the creep successfully collected or moved to collect energy, false otherwise
     */
    collectEnergy: function(creep) {
        if(creep.store.getFreeCapacity() === 0) {
            return false;
        }

        var tombstones = creep.room.find(FIND_TOMBSTONES, {
            filter: (tombstone) => {
                return tombstone.store[RESOURCE_ENERGY] > 0;
            }
        });
        var droppedEnergy = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: (resource) => {
                return resource.resourceType == RESOURCE_ENERGY;
            }
        });
        var sources = creep.room.find(FIND_SOURCES, {
            filter: (source) => {
                return source.energy > 0;
            }
        });

        if (tombstones.length > 0) {
            var target = creep.pos.findClosestByPath(tombstones);
            if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }
        else if (droppedEnergy.length > 0) {
            var target = creep.pos.findClosestByPath(droppedEnergy);
            if (creep.pickup(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target);
            }
            return true;
        }
        else if (sources.length > 0) {
            var target = creep.pos.findClosestByPath(sources);
            if(creep.harvest(target) == ERR_NOT_IN_RANGE) {
                this.moveTo(creep, target, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
            return true;
        }

        return false;
    },

    /**
     * Moves a creep to a target with path caching for efficiency
     * @param {Creep} creep - The creep to move
     * @param {RoomObject} target - The target to move to
     * @param {Object} opts - Additional options for moveTo
     * @returns {number} - The result of the move operation
     */
    moveTo: function(creep, target, opts = {}) {
        const cacheKey = `${target.x},${target.y},${target.roomName}`;

        if (creep.memory._move &&
            creep.memory._move.target === cacheKey &&
            creep.memory._move.task === creep.memory.task && // Check if the task is the same
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

        const moveResult = creep.moveTo(target, {
            visualizePathStyle: { stroke: '#ffffff' },
            reusePath: 5,
            ...opts
        });

        if (moveResult === OK) {
            creep.memory._move = {
                target: cacheKey,
                path: creep.pos.findPathTo(target, opts),
                tick: Game.time,
                task: creep.memory.task // Store the current task in the cached path data
            };
        } else if (moveResult == ERR_NO_PATH){
            delete creep.memory._move;
        }
        return moveResult;
    }
};
