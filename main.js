var roleHarvester = require('role.harvester');
var roleUpgrader = require('role.upgrader');
var roleBuilder = require('role.builder');
var config = require('config');

module.exports.loop = function () {
    if (Game.cpu.bucket === 10000) {
        try{
            Game.cpu.generatePixel();
        }
        catch (err) {
            //We don't really care if we fail to generate a pixel, but we'd like to try.
        }
    }
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');

    // Determine which body parts to use based on available energy
    var spawn = Game.spawns['Spawn1'];
    var energyAvailable = spawn.room.energyAvailable;
    var bodyParts;

    if (energyAvailable >= 800) {
        bodyParts = config.creepBodyParts.advanced;
    } else if (energyAvailable >= 550) {
        bodyParts = config.creepBodyParts.standard;
    } else {
        bodyParts = config.creepBodyParts.basic;
    }

    // Spawn creeps in priority order: harvester > upgrader > builder
    if (harvesters.length < config.creepCounts.harvester) {
        var newName = 'Harvester' + Game.time;
        spawn.spawnCreep(bodyParts.harvester, newName, {
            memory: { role: 'harvester' }
        });
    }
    else if (upgraders.length < config.creepCounts.upgrader) {
        var newName = 'Upgrader' + Game.time;
        spawn.spawnCreep(bodyParts.upgrader, newName, {
            memory: { role: 'upgrader' }
        });
    }
    else if (builders.length < config.creepCounts.builder) {
        var newName = 'Builder' + Game.time;
        spawn.spawnCreep(bodyParts.builder, newName, {
            memory: { role: 'builder' }
        });
    }

    if(Game.spawns['Spawn1'].spawning) {
        var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
        Game.spawns['Spawn1'].room.visual.text(
            '🛠️' + spawningCreep.memory.role,
            Game.spawns['Spawn1'].pos.x + 1,
            Game.spawns['Spawn1'].pos.y,
            {align: 'left', opacity: 0.8});
    }
    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        if(creep.memory.role == 'harvester') {
            roleHarvester.run(creep);
        }
        if(creep.memory.role == 'upgrader') {
            roleUpgrader.run(creep);
        }
        if(creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
    }
}
