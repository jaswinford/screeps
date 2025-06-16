var utils = require('utils');
var config = require('config');

var roleBuilder = {

    /** @param {Creep} creep **/
    run: function(creep) {

        if(creep.memory.building && creep.store[RESOURCE_ENERGY] == 0) {
            creep.memory.building = false;
            creep.say('🔄 harvest');
        }
        if(!creep.memory.building && creep.store.getFreeCapacity() == 0) {
            creep.memory.building = true;
            creep.say('🚧 build');
        }

        if(creep.memory.building) {
            // Priority order for construction: spawn > extension > tower > storage > container > road > wall
            var targets = creep.room.find(FIND_CONSTRUCTION_SITES);

            if(targets.length) {
                // Use priority order from config
                const priorityOrder = config.structures.buildPriority;

                // Sort targets by priority
                targets.sort((a, b) => {
                    const priorityA = priorityOrder.indexOf(a.structureType);
                    const priorityB = priorityOrder.indexOf(b.structureType);

                    if (priorityA === priorityB) {
                        // If same priority, choose the closest one
                        const distanceA = creep.pos.getRangeTo(a);
                        const distanceB = creep.pos.getRangeTo(b);
                        return distanceA - distanceB;
                    }

                    return priorityA - priorityB;
                });

                // Build the highest priority target
                if(creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                    utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.build});
                }
            }
            else {
                // Priority order for repairs: critical structures first, then by damage percentage
                targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => {
                        return (structure.hits/structure.hitsMax) < config.structures.repairThreshold;
                    }
                });

                if(targets.length) {
                    // Sort by damage percentage (most damaged first)
                    targets.sort((a, b) => {
                        const ratioA = a.hits / a.hitsMax;
                        const ratioB = b.hits / b.hitsMax;
                        return ratioA - ratioB;
                    });

                    if(creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                        utils.moveTo(creep, targets[0], {visualizePathStyle: config.pathVisuals.repair});
                    }
                }
                // If nothing to build or repair, upgrade controller as fallback
                else if(creep.room.controller) {
                    if(creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        utils.moveTo(creep, creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
        else {
            utils.collectEnergy(creep);
        }
    }
};

module.exports = roleBuilder;
