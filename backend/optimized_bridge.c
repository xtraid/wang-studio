/* Thin ABI bridge only: all search/propagation lives in Tiling Foundry. */
#include "wang/solver.h"
#include <stdint.h>
#include <string.h>

int studio_solve(int32_t width, int32_t height, const uint8_t *active,
                 const uint8_t *boundary, const uint8_t *edges,
                 size_t tile_count, const uint32_t *initial,
                 uint8_t *out_tiles, uint64_t *metrics)
{
    if (!active || !boundary || !edges || !initial || !out_tiles || !metrics ||
        tile_count == 0 || tile_count > WANG_RUNTIME_MAX_TILES) return -1;
    Region region = {0};
    if (!region_init(&region, width, height)) return -1;
    WangTile tiles[WANG_RUNTIME_MAX_TILES] = {0};
    for (size_t t = 0; t < tile_count; ++t) {
        tiles[t].id = (TileId)t;
        memcpy(tiles[t].edge, edges + t * DIR_COUNT, DIR_COUNT);
    }
    for (size_t i = 0; i < region.cell_count; ++i) {
        region.cells[i].active = active[i] != 0;
        memcpy(region.cells[i].boundary, boundary + i * DIR_COUNT, DIR_COUNT);
    }
    WangSolveResult result = {0};
    WangSolverOptions options = {
        .flags = WANG_SOLVE_COLLECT_METRICS,
        .initial_domains = initial,
        .initial_domain_count = region.cell_count
    };
    const int status = wang_solve_optimized_tileset(
        &region, tiles, tile_count, &options, &result);
    metrics[0] = result.metrics.dfs_nodes;
    metrics[1] = result.metrics.backtracks;
    metrics[2] = result.metrics.domain_reductions;
    if (status == WANG_SOLVE_SAT) {
        for (size_t i = 0; i < region.cell_count; ++i) {
            out_tiles[i] = TILE_NONE;
            if (!region.cells[i].active) continue;
            uint32_t domain = result.domains[i];
            TileId tile = 0;
            while ((domain & UINT32_C(1)) == 0) { domain >>= 1; ++tile; }
            out_tiles[i] = tile;
        }
    }
    wang_solve_result_destroy(&result);
    region_destroy(&region);
    return status;
}

typedef int (*StudioVisitor)(const uint32_t *, size_t, uint64_t, uint64_t,
                             uint64_t, void *);
typedef struct { StudioVisitor visitor; void *userdata; } StudioEnumeration;

static bool studio_visit(const uint32_t *domains, size_t count,
                         const WangSolverMetrics *metrics, void *userdata)
{
    StudioEnumeration *enumeration = userdata;
    return enumeration->visitor(domains, count, metrics->dfs_nodes,
        metrics->backtracks, metrics->domain_reductions,
        enumeration->userdata) != 0;
}

int studio_enumerate(int32_t width, int32_t height, const uint8_t *active,
                     const uint8_t *boundary, const uint8_t *edges,
                     size_t tile_count, const uint32_t *initial,
                     StudioVisitor visitor, void *userdata, uint64_t *metrics)
{
    if (!active || !boundary || !edges || !initial || !visitor || !metrics ||
        tile_count == 0 || tile_count > WANG_RUNTIME_MAX_TILES) return -1;
    Region region = {0};
    if (!region_init(&region, width, height)) return -1;
    WangTile tiles[WANG_RUNTIME_MAX_TILES] = {0};
    for (size_t t = 0; t < tile_count; ++t) {
        tiles[t].id = (TileId)t;
        memcpy(tiles[t].edge, edges + t * DIR_COUNT, DIR_COUNT);
    }
    for (size_t i = 0; i < region.cell_count; ++i) {
        region.cells[i].active = active[i] != 0;
        memcpy(region.cells[i].boundary, boundary + i * DIR_COUNT, DIR_COUNT);
    }
    WangSolverOptions options = {.flags = WANG_SOLVE_COLLECT_METRICS,
        .initial_domains = initial, .initial_domain_count = region.cell_count};
    StudioEnumeration enumeration = {visitor, userdata};
    WangSolverMetrics result = {0};
    const int status = wang_enumerate_optimized_tileset(&region, tiles,
        tile_count, &options, studio_visit, &enumeration, &result);
    metrics[0] = result.dfs_nodes;
    metrics[1] = result.backtracks;
    metrics[2] = result.domain_reductions;
    region_destroy(&region);
    return status;
}
