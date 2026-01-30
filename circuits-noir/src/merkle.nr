use std::hash::poseidon;

global TREE_DEPTH: u32 = 32;

pub fn compute_merkle_root(
    leaf: Field,
    path_elements: [Field; 32],
    path_indices: [u1; 32],
) -> Field {
    let mut current = leaf;

    for i in 0..32 {
        let sibling = path_elements[i];
        let index = path_indices[i];
        if index == 0 {
            // current on left, sibling on right
            current = poseidon::bn254::hash_2([current, sibling]);
        } else {
            // sibling on left, current on right
            current = poseidon::bn254::hash_2([sibling, current]);
        }
    }

    current
}

pub fn verify_merkle_proof(
    leaf: Field,
    root: Field,
    path_elements: [Field; 32],
    path_indices: [u1; 32],
) -> bool {
    let computed_root = compute_merkle_root(leaf, path_elements, path_indices);
    computed_root == root
}

#[test]
fn test_merkle_single_leaf() {
    let leaf: Field = 12345;
    let mut path_elements: [Field; 32] = [0; 32];
    let path_indices: [u1; 32] = [0; 32];

    let root = compute_merkle_root(leaf, path_elements, path_indices);
    let root2 = compute_merkle_root(leaf, path_elements, path_indices);
    assert(root == root2);
}

#[test]
fn test_merkle_path_sensitivity() {
    let leaf: Field = 12345;
    let path_elements: [Field; 32] = [1; 32];

    let mut path_indices_left: [u1; 32] = [0; 32];
    let mut path_indices_right: [u1; 32] = [0; 32];
    path_indices_right[0] = 1;

    let root_left = compute_merkle_root(leaf, path_elements, path_indices_left);
    let root_right = compute_merkle_root(leaf, path_elements, path_indices_right);
    assert(root_left != root_right);
}
