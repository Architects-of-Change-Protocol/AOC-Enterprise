/**
 * Semantic version of the kernel's public surface (`AocKernel`, its
 * contracts, reason codes, and trace shape). Only the exported public
 * contract is versioned this way -- internal orchestration/adapter modules
 * are not individually stable and may change without a version bump here.
 */
export const AOC_KERNEL_VERSION = '1.0.0';
