use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ComponentType {
    Container,
    Text,
    Image,
    Markdown,
    Divider,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VisonComponent {
    pub version: Option<String>,
    pub r#type: ComponentType,
    #[serde(default)]
    pub props: HashMap<String, Value>,
    #[serde(default)]
    pub style: HashMap<String, Value>,
    #[serde(default)]
    pub children: Option<Vec<VisonComponent>>,
}

#[derive(Error, Debug)]
pub enum VisonError {
    #[error("Maximum nesting depth exceeded (max: {0})")]
    MaxDepthExceeded(usize),
    #[error("Maximum node count exceeded (max: {0})")]
    MaxNodeCountExceeded(usize),
    #[error("Maximum image count exceeded (max: {0})")]
    MaxImageCountExceeded(usize),
    #[error("Text node length exceeded (max: {0})")]
    MaxTextLengthExceeded(usize),
    #[error("Invalid component type for children: {0:?}")]
    InvalidChildContainer(ComponentType),
    #[error("Image component must have width+height or width+aspectRatio")]
    InvalidImageConstraints,
    #[error("Invalid style property: {0}")]
    InvalidStyleProperty(String),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

pub struct Validator {
    style_whitelist: HashSet<String>,
}

impl Default for Validator {
    fn default() -> Self {
        Self::new()
    }
}

impl Validator {
    const MAX_DEPTH: usize = 5;
    const MAX_NODES: usize = 64;
    const MAX_IMAGES: usize = 4;
    const MAX_TEXT_LEN: usize = 65536;

    pub fn new() -> Self {
        let mut style_whitelist = HashSet::new();
        let list = vec![
            // layout
            "padding",
            "margin",
            "flexDirection",
            "alignItems",
            "justifyContent",
            "width",
            "height",
            "maxWidth",
            "minWidth",
            "gap",
            // text
            "color",
            "fontSize",
            "fontWeight",
            "lineHeight",
            "textAlign",
            // visual
            "backgroundColor",
            "borderRadius",
            "borderWidth",
            "borderColor",
            "opacity",
            "aspectRatio", // reserved specifically for images
        ];
        for item in list {
            style_whitelist.insert(item.to_string());
        }
        Self { style_whitelist }
    }

    pub fn validate(&self, component: &VisonComponent) -> Result<(), VisonError> {
        let mut node_count = 0;
        let mut image_count = 0;
        self.check_recursive(component, 1, &mut node_count, &mut image_count)?;

        if node_count > Self::MAX_NODES {
            return Err(VisonError::MaxNodeCountExceeded(Self::MAX_NODES));
        }

        Ok(())
    }

    fn check_recursive(
        &self,
        component: &VisonComponent,
        current_depth: usize,
        node_count: &mut usize,
        image_count: &mut usize,
    ) -> Result<(), VisonError> {
        *node_count += 1;

        if current_depth > Self::MAX_DEPTH {
            return Err(VisonError::MaxDepthExceeded(Self::MAX_DEPTH));
        }

        // Validate against the style whitelist
        for key in component.style.keys() {
            if !self.style_whitelist.contains(key) {
                // Spec section 12: invalid styles are ignored. Here we choose to error
                // at the validation layer to keep the generating side spec-compliant.
                // For maximum fault tolerance this could instead warn or silently filter.
                return Err(VisonError::InvalidStyleProperty(key.clone()));
            }
        }

        match component.r#type {
            ComponentType::Image => {
                *image_count += 1;
                if *image_count > Self::MAX_IMAGES {
                    return Err(VisonError::MaxImageCountExceeded(Self::MAX_IMAGES));
                }
                // Validate image size constraints (spec section 9.1)
                let has_width =
                    component.props.contains_key("width") || component.style.contains_key("width");
                let has_height = component.props.contains_key("height")
                    || component.style.contains_key("height");
                let has_ratio = component.props.contains_key("aspectRatio")
                    || component.style.contains_key("aspectRatio");

                if !has_width || (!has_height && !has_ratio) {
                    return Err(VisonError::InvalidImageConstraints);
                }
            }
            ComponentType::Text => {
                if let Some(text) = component.props.get("text").and_then(|v| v.as_str()) {
                    if text.len() > Self::MAX_TEXT_LEN {
                        return Err(VisonError::MaxTextLengthExceeded(Self::MAX_TEXT_LEN));
                    }
                }
            }
            ComponentType::Markdown => {
                if let Some(content) = component.props.get("content").and_then(|v| v.as_str()) {
                    if content.len() > Self::MAX_TEXT_LEN {
                        return Err(VisonError::MaxTextLengthExceeded(Self::MAX_TEXT_LEN));
                    }
                }
            }
            _ => {}
        }

        if let Some(children) = &component.children {
            if !matches!(component.r#type, ComponentType::Container) {
                return Err(VisonError::InvalidChildContainer(component.r#type.clone()));
            }
            for child in children {
                self.check_recursive(child, current_depth + 1, node_count, image_count)?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_base_container() -> VisonComponent {
        VisonComponent {
            version: Some("1".to_string()),
            r#type: ComponentType::Container,
            props: HashMap::new(),
            style: HashMap::new(),
            children: None,
        }
    }

    #[test]
    fn test_valid_structure() {
        let json = r#"
        {
            "version": "1",
            "type": "container",
            "children": [
                { "type": "text", "props": { "text": "hello" } }
            ]
        }
        "#;
        let component: VisonComponent = serde_json::from_str(json).unwrap();
        let validator = Validator::new();
        assert!(validator.validate(&component).is_ok());
    }

    #[test]
    fn test_depth_limit() {
        let mut current = create_base_container();
        // Build 6 levels of nesting (1 root + 5 children) -> depth 6
        for _ in 0..5 {
            current = VisonComponent {
                version: None,
                r#type: ComponentType::Container,
                props: HashMap::new(),
                style: HashMap::new(),
                children: Some(vec![current]),
            };
        }
        let validator = Validator::new();
        let result = validator.validate(&current);
        assert!(matches!(result, Err(VisonError::MaxDepthExceeded(5))));
    }

    #[test]
    fn test_node_count_limit() {
        let mut children = vec![];
        for _ in 0..64 {
            children.push(VisonComponent {
                version: None,
                r#type: ComponentType::Divider,
                props: HashMap::new(),
                style: HashMap::new(),
                children: None,
            });
        }
        let root = VisonComponent {
            version: None,
            r#type: ComponentType::Container,
            props: HashMap::new(),
            style: HashMap::new(),
            children: Some(children),
        };
        // 65 nodes total (1 root + 64 children)
        let validator = Validator::new();
        let result = validator.validate(&root);
        assert!(matches!(result, Err(VisonError::MaxNodeCountExceeded(64))));
    }

    #[test]
    fn test_image_count_limit() {
        let mut children = vec![];
        for _ in 0..5 {
            let mut props = HashMap::new();
            props.insert("src".to_string(), Value::String("...".into()));
            props.insert("width".to_string(), Value::Number(100.into()));
            props.insert("aspectRatio".to_string(), Value::Number(1.into()));

            children.push(VisonComponent {
                version: None,
                r#type: ComponentType::Image,
                props,
                style: HashMap::new(),
                children: None,
            });
        }
        let root = VisonComponent {
            version: None,
            r#type: ComponentType::Container,
            props: HashMap::new(),
            style: HashMap::new(),
            children: Some(children),
        };
        let validator = Validator::new();
        let result = validator.validate(&root);
        assert!(matches!(result, Err(VisonError::MaxImageCountExceeded(4))));
    }

    #[test]
    fn test_image_constraints() {
        let mut props = HashMap::new();
        props.insert("src".to_string(), Value::String("...".into()));
        // Missing height and aspectRatio
        props.insert("width".to_string(), Value::Number(100.into()));

        let img = VisonComponent {
            version: None,
            r#type: ComponentType::Image,
            props,
            style: HashMap::new(),
            children: None,
        };
        let validator = Validator::new();
        let result = validator.validate(&img);
        assert!(matches!(result, Err(VisonError::InvalidImageConstraints)));
    }

    #[test]
    fn test_style_whitelist() {
        let mut style = HashMap::new();
        style.insert("position".to_string(), Value::String("absolute".into())); // disallowed property

        let comp = VisonComponent {
            version: None,
            r#type: ComponentType::Container,
            props: HashMap::new(),
            style,
            children: None,
        };
        let validator = Validator::new();
        let result = validator.validate(&comp);
        assert!(matches!(result, Err(VisonError::InvalidStyleProperty(s)) if s == "position"));
    }

    #[test]
    fn test_text_length_limit() {
        let mut props = HashMap::new();
        props.insert("text".to_string(), Value::String("a".repeat(65537)));

        let comp = VisonComponent {
            version: None,
            r#type: ComponentType::Text,
            props,
            style: HashMap::new(),
            children: None,
        };
        let validator = Validator::new();
        let result = validator.validate(&comp);
        assert!(matches!(
            result,
            Err(VisonError::MaxTextLengthExceeded(65536))
        ));
    }
}
